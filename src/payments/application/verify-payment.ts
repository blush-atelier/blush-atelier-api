import type { PaymentGateway } from '../domain/payment-gateway.port';
import type {
  PaymentUnitOfWork,
  PaymentResult,
  PaymentEventVerifier,
} from '../domain/payment-ports';
import { decidePaymentTransition } from '../domain/payment-transition';
export const validProviderId = (value: string) =>
  /^[A-Za-z0-9_-]{1,128}$/.test(value);
export class VerifyPayment {
  constructor(
    private readonly unit: PaymentUnitOfWork,
    private readonly gateway: PaymentGateway,
  ) {}
  async execute(
    customerId: string,
    id: string,
    providerId?: string,
  ): Promise<PaymentResult<{ verified: boolean; submitted: boolean }>> {
    if (providerId !== undefined && !validProviderId(providerId))
      return { ok: false, error: 'InvalidPaymentInput' };
    const current = await this.unit.run(async (store) => {
      const order = await store.find(id, customerId);
      return order
        ? { ok: true, value: order }
        : { ok: false, error: 'TransactionNotFound' };
    });
    if (!current.ok) return current;
    if (
      providerId &&
      current.value.providerPaymentId &&
      providerId !== current.value.providerPaymentId
    )
      return { ok: false, error: 'PaymentIdentityMismatch' };
    const lookupId = providerId ?? current.value.providerPaymentId;
    if (!lookupId)
      return {
        ok: true,
        value: {
          verified: false,
          submitted: Boolean(current.value.paymentSubmittedAt),
        },
      };
    if (!current.value.paymentStartedAt)
      return { ok: false, error: 'InvalidPaymentState' };
    // La red queda fuera de la transacción DB para no bloquear stock esperando al proveedor.
    const observed = await this.gateway.getPayment(lookupId);
    if (!observed.ok) return observed;
    return this.unit.run(async (store) => {
      const order = await store.find(id, customerId);
      if (!order) return { ok: false, error: 'TransactionNotFound' };
      if (!order.paymentStartedAt)
        return { ok: false, error: 'InvalidPaymentState' };
      const decision = decidePaymentTransition(order, observed.value);
      if (!decision.ok) return decision;
      await store.apply(order, observed.value, decision.value);
      return {
        ok: true,
        value: { verified: true, submitted: Boolean(order.paymentSubmittedAt) },
      };
    });
  }
}
export type PaymentEventReceipt = {
  received: true;
  outcome: 'confirmed' | 'released' | 'pending' | 'duplicate' | 'ignored';
};
export class ProcessPaymentEvent {
  constructor(
    private readonly verifier: PaymentEventVerifier,
    private readonly gateway: PaymentGateway,
    private readonly unit: PaymentUnitOfWork,
  ) {}
  async execute(body: unknown): Promise<PaymentResult<PaymentEventReceipt>> {
    const authenticated = this.verifier.verify(body);
    if (!authenticated.ok) return authenticated;
    const observed = await this.gateway.getPayment(
      authenticated.value.providerPaymentId,
    );
    if (!observed.ok) return observed;
    return this.unit.run<PaymentEventReceipt>(async (store) => {
      const order = await store.findByReference(observed.value.reference);
      // Un comercio puede tener pagos de otras aplicaciones; no les inventamos un pedido.
      if (!order)
        return { ok: true, value: { received: true, outcome: 'ignored' } };
      if (!order.paymentStartedAt)
        return { ok: false, error: 'InvalidPaymentState' };
      const decision = decidePaymentTransition(order, observed.value);
      if (!decision.ok) return decision;
      // Un reintento final se reconoce bajo bloqueo, sin repetir escrituras ni stock.
      if (decision.value.kind === 'already-applied')
        return { ok: true, value: { received: true, outcome: 'duplicate' } };
      await store.apply(order, observed.value, decision.value);
      const outcome =
        decision.value.kind === 'confirm'
          ? 'confirmed'
          : decision.value.kind === 'release'
            ? 'released'
            : 'pending';
      return { ok: true, value: { received: true, outcome } };
    });
  }
}
