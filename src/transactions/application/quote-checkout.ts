import type {
  CheckoutUnitOfWork,
  QuoteInput,
  CheckoutStore,
} from '../domain/checkout-unit-of-work.port';
import { calculateQuote, type CheckoutFees } from '../domain/pricing';
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
      const product = await currentProduct(
        store,
        input.productId,
        this.runtime.now(),
      );
      if (!product) return { ok: false, error: 'ProductNotFound' };
      if (!(await store.lockDelivery(input.deliveryId, customerId)))
        return { ok: false, error: 'DeliveryNotFound' };
      return calculateQuote(product, input.quantity, this.fees);
    });
  }
}
