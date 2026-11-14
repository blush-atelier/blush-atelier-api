import type {
  CheckoutUnitOfWork,
  QuoteInput,
  CheckoutStore,
} from '../domain/checkout-unit-of-work.port';
import { calculateBasket, type CheckoutFees } from '../domain/pricing';
import type { CheckoutRuntime } from '../../shared/domain/checkout';
export async function currentProduct(
  store: CheckoutStore,
  productId: string,
  now: Date,
) {
  const product = await store.lockProduct(productId);
  if (!product) return null;
  // Solo vencen reservas sin intento de pago iniciado; un timeout del proveedor nunca libera stock.
  await store.releaseExpiredUnstarted(productId, now);
  return store.lockProduct(productId);
}
export class QuoteCheckout {
  constructor(
    private readonly unit: CheckoutUnitOfWork,
    private readonly fees: CheckoutFees,
    private readonly runtime: CheckoutRuntime,
  ) {}
  execute(customerId: string, input: QuoteInput) {
    return this.unit.run(async (store) => {
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
        return { ok: false, error: 'InvalidCheckout' };
      const products = [];
      for (const item of items) {
        const product = await currentProduct(
          store,
          item.productId,
          this.runtime.now(),
        );
        if (!product) return { ok: false, error: 'ProductNotFound' };
        products.push(product);
      }
      if (!(await store.lockDelivery(input.deliveryId, customerId)))
        return { ok: false, error: 'DeliveryNotFound' };
      return calculateBasket(
        products,
        items.map((i) => i.quantity),
        this.fees,
      );
    });
  }
}
