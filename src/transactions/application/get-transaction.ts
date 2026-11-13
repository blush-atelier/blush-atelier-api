import type { CheckoutUnitOfWork } from '../domain/checkout-unit-of-work.port';
import { transactionView } from './transaction-view';
import type { CheckoutRuntime } from '../../shared/domain/checkout';
import { currentProduct } from './quote-checkout';
export class GetTransaction {
  constructor(
    private readonly unit: CheckoutUnitOfWork,
    private readonly runtime: CheckoutRuntime,
  ) {}
  execute(customerId: string, id: string) {
    return this.unit.run(async (store) => {
      const transaction = await store.findOwned(id, customerId);
      if (!transaction) return { ok: false, error: 'TransactionNotFound' };
      await currentProduct(store, transaction.productId, this.runtime.now());
      const current = await store.findOwned(id, customerId);
      if (!current) return { ok: false, error: 'TransactionNotFound' };
      return { ok: true, value: transactionView(current) };
    });
  }
}
