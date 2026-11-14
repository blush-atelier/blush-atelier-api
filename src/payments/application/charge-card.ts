import type {
  CardAuthorization,
  CardConfiguration,
  CardPaymentsGateway,
} from '../domain/card-payments.port';
import type {
  PaymentUnitOfWork,
  PaymentResult,
  PaymentRecord,
} from '../domain/payment-ports';
import type { CheckoutRuntime } from '../../shared/domain/checkout';
import { decidePaymentTransition } from '../domain/payment-transition';
export class GetCardConfiguration {
  constructor(private readonly gateway: CardPaymentsGateway) {}
  execute(): Promise<PaymentResult<CardConfiguration>> {
    return this.gateway.configuration();
  }
}
export class ChargeCard {
  constructor(
    private readonly unit: PaymentUnitOfWork,
    private readonly gateway: CardPaymentsGateway,
    private readonly runtime: CheckoutRuntime,
  ) {}
  async execute(
    customerId: string,
    id: string,
    input: CardAuthorization,
    clientIp: string,
  ): Promise<PaymentResult<{ accepted: true }>> {
    if (
      !/^tok_(?:test_|stagtest)[A-Za-z0-9_-]{1,180}$/.test(input.token) ||
      !Number.isInteger(input.installments) ||
      input.installments < 1 ||
      input.installments > 36 ||
      input.privacyAccepted !== true ||
      input.personalDataAccepted !== true ||
      ![input.acceptanceToken, input.personalDataToken].every(
        (t) =>
          typeof t === 'string' &&
          t.length > 0 &&
          t.length <= 4096 &&
          !/\s/.test(t),
      )
    )
      return { ok: false, error: 'InvalidPaymentInput' };
    if (!this.gateway.enabled)
      return { ok: false, error: 'PaymentNotConfigured' };
    const claim = await this.unit.run<
      { send: false } | { send: true; order: PaymentRecord }
    >(async (store) => {
      const order = await store.find(id, customerId);
      if (!order) return { ok: false, error: 'TransactionNotFound' };
      // La marca se confirma ANTES de la llamada remota: un reintento nunca hace otro POST.
      if (order.paymentSubmittedAt)
        return { ok: true, value: { send: false as const } };
      if (
        order.status !== 'PENDING' ||
        order.reservationStatus !== 'ACTIVE' ||
        order.providerPaymentId ||
        order.paymentStartedAt
      )
        return { ok: false, error: 'InvalidPaymentState' };
      if (BigInt(order.totalMinor) > BigInt(Number.MAX_SAFE_INTEGER))
        return { ok: false, error: 'AmountOutOfRange' };
      const now = this.runtime.now();
      if (Date.parse(order.reservationExpiresAt) <= now.getTime())
        return { ok: false, error: 'PaymentSessionExpired' };
      await store.claimSubmission(id, now, order.reservationExpiresAt);
      return { ok: true, value: { send: true as const, order } };
    });
    if (!claim.ok) return claim;
    if (!claim.value.send) return { ok: true, value: { accepted: true } };
    const order = claim.value.order;
    const response = await this.gateway.charge({
      ...input,
      reference: order.reference,
      amountMinor: order.totalMinor,
      customerEmail: order.customerEmail,
      clientIp,
    });
    if (!response.ok) return response;
    return this.unit.run(async (store) => {
      const current = await store.find(id, customerId);
      if (!current) return { ok: false, error: 'TransactionNotFound' };
      const decision = decidePaymentTransition(current, response.value);
      if (!decision.ok) {
        // Un webhook verificado puede haber finalizado antes de que llegue la respuesta de creación.
        if (
          decision.error === 'InvalidPaymentState' &&
          current.status !== 'PENDING' &&
          current.providerPaymentId === response.value.id
        )
          return { ok: true, value: { accepted: true } };
        return decision;
      }
      await store.apply(current, response.value, decision.value);
      return { ok: true, value: { accepted: true } };
    });
  }
}
