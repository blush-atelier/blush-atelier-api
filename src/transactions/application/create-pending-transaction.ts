import type {
  CheckoutUnitOfWork,
  PendingInput,
  StoredTransaction,
} from '../domain/checkout-unit-of-work.port';
import { transactionView } from './transaction-view';
import { calculateQuote, type CheckoutFees } from '../domain/pricing';
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
    const hash = this.runtime.hash(
      JSON.stringify({
        productId: input.productId,
        quantity: input.quantity,
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
      const product = await currentProduct(store, input.productId, now);
      if (!product) return { ok: false, error: 'ProductNotFound' };
      if (!(await store.lockDelivery(input.deliveryId, customerId)))
        return { ok: false, error: 'DeliveryNotFound' };
      if (await store.deliveryUsed(input.deliveryId))
        return { ok: false, error: 'DeliveryAlreadyUsed' };
      const quote = calculateQuote(product, input.quantity, this.fees);
      if (!quote.ok) return quote;
      // expectedTotal es consentimiento del cliente, nunca la fuente del precio cobrado.
      if (quote.value.totalMinor !== input.expectedTotalMinor)
        return { ok: false, error: 'QuoteChanged' };
      if (!(await store.reserve(input.productId, input.quantity)))
        return { ok: false, error: 'InsufficientStock' };
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
