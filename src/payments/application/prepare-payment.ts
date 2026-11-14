import type {
  PaymentUnitOfWork,
  PaymentCheckout,
  PaymentSession,
  PaymentResult,
} from '../domain/payment-ports';
import type { CheckoutRuntime } from '../../shared/domain/checkout';
export class PreparePayment {
  constructor(
    private readonly unit: PaymentUnitOfWork,
    private readonly checkout: PaymentCheckout,
    private readonly runtime: CheckoutRuntime,
  ) {}
  execute(
    customerId: string,
    id: string,
    method = 'CARD',
  ): Promise<PaymentResult<PaymentSession>> {
    if (method !== 'CARD')
      return Promise.resolve({ ok: false, error: 'InvalidPaymentInput' });
    return this.unit.run(async (store) => {
      const order = await store.find(id, customerId);
      if (!order) return { ok: false, error: 'TransactionNotFound' };
      if (
        order.status !== 'PENDING' ||
        order.reservationStatus !== 'ACTIVE' ||
        order.providerPaymentId
      )
        return { ok: false, error: 'InvalidPaymentState' };
      const now = this.runtime.now();
      const expiresAt = order.paymentExpiresAt ?? order.reservationExpiresAt;
      if (new Date(expiresAt).getTime() <= now.getTime())
        return { ok: false, error: 'PaymentSessionExpired' };
      const session = this.checkout.create(
        order.reference,
        order.totalMinor,
        expiresAt,
      );
      if (!session.ok) return session;
      // Se fija antes de abrir el proveedor; un timeout no permite liberar por tiempo.
      if (!order.paymentStartedAt) await store.start(order.id, now, expiresAt);
      return session;
    });
  }
}
