import type {
  CheckoutUnitOfWork,
  PendingInput,
  StoredTransaction,
} from '../domain/checkout-unit-of-work.port';
import { transactionView } from './transaction-view';
import { calculateBasket, type CheckoutFees } from '../domain/pricing';
import type {
  CheckoutRuntime,
  CheckoutResult,
} from '../../shared/domain/checkout';
import { currentProduct } from './quote-checkout';
export class CreatePendingTransaction {
  constructor(
    private readonly unit: CheckoutUnitOfWork,
    private readonly fees: CheckoutFees,
    private readonly runtime: CheckoutRuntime,
  ) {}
  execute(
    customerId: string,
    key: string,
    input: PendingInput,
  ): Promise<CheckoutResult<ReturnType<typeof transactionView>>> {
    if (
      !/^[A-Za-z0-9_-]{8,128}$/.test(key) ||
      !/^(0|[1-9][0-9]{0,18})$/.test(input.expectedTotalMinor)
    )
      return Promise.resolve({ ok: false, error: 'InvalidCheckout' });
    const items = input.items ?? [
      { productId: input.productId, quantity: input.quantity },
    ];
    if (
      !items.length ||
      items.length > 50 ||
      new Set(items.map((i) => i.productId)).size !== items.length ||
      items[0].productId !== input.productId ||
      items[0].quantity !== input.quantity
    )
      return Promise.resolve({ ok: false, error: 'InvalidCheckout' });
    const hash = this.runtime.hash(
      JSON.stringify({
        ...(items.length === 1
          ? { productId: input.productId, quantity: input.quantity }
          : {
              items: [...items].sort((a, b) =>
                a.productId.localeCompare(b.productId),
              ),
            }),
        deliveryId: input.deliveryId,
        expectedTotalMinor: input.expectedTotalMinor,
      }),
    );
    return this.unit.run(async (store) => {
      // Serializa reintentos de la misma solicitud antes de consultar o reservar.
      await store.lockRequest(customerId, key);
      const existing = await store.findByKey(customerId, key);
      if (existing)
        return existing.requestHash === hash
          ? { ok: true, value: transactionView(existing) }
          : { ok: false, error: 'IdempotencyConflict' };
      const now = this.runtime.now();
      const products = [];
      for (const item of items) {
        const product = await currentProduct(store, item.productId, now);
        if (!product) return { ok: false, error: 'ProductNotFound' };
        products.push(product);
      }
      if (!(await store.lockDelivery(input.deliveryId, customerId)))
        return { ok: false, error: 'DeliveryNotFound' };
      if (await store.deliveryUsed(input.deliveryId))
        return { ok: false, error: 'DeliveryAlreadyUsed' };
      const quote = calculateBasket(
        products,
        items.map((i) => i.quantity),
        this.fees,
      );
      if (!quote.ok) return quote;
      // expectedTotal es consentimiento del cliente, nunca la fuente del precio cobrado.
      if (quote.value.totalMinor !== input.expectedTotalMinor)
        return { ok: false, error: 'QuoteChanged' };
      for (const item of items) {
        if (!(await store.reserve(item.productId, item.quantity)))
          return { ok: false, error: 'InsufficientStock' };
      }
      const id = this.runtime.id();
      const transaction: StoredTransaction = {
        ...quote.value,
        id,
        reference: `BA-${id}`,
        customerId,
        deliveryId: input.deliveryId,
        idempotencyKey: key,
        requestHash: hash,
        status: 'PENDING',
        reservationStatus: 'ACTIVE',
        reservationExpiresAt: new Date(now.getTime() + 900000).toISOString(),
      };
      await store.insert(transaction);
      return { ok: true, value: transactionView(transaction) };
    });
  }
}
