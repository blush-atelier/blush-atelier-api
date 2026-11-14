import type { StoredTransaction } from '../../transactions/domain/checkout-unit-of-work.port';
import type { Result } from '../../shared/domain/result';
import { MAX_MONEY, validText } from '../../shared/domain/checkout';
import type { PaymentObservation } from './payment-gateway.port';

export type PaymentOrder = Pick<
  StoredTransaction,
  'reference' | 'totalMinor' | 'currency' | 'status' | 'reservationStatus'
> & { providerPaymentId: string | null };

export type PaymentTransitionError =
  | 'InvalidPaymentObservation'
  | 'PaymentIdentityMismatch'
  | 'PaymentAmountMismatch'
  | 'PaymentCurrencyMismatch'
  | 'InvalidPaymentState';

export type PaymentDecision =
  | { kind: 'pending'; providerPaymentId: string }
  | { kind: 'confirm'; providerPaymentId: string }
  | { kind: 'release'; status: 'DECLINED' | 'ERROR'; providerPaymentId: string }
  | { kind: 'already-applied'; providerPaymentId: string };

// Esta regla no autentica eventos: recibe la observación obtenida del proveedor por el backend.
export function decidePaymentTransition(
  order: PaymentOrder,
  payment: PaymentObservation,
): Result<PaymentDecision, PaymentTransitionError> {
  if (
    !validText(payment.id, 1, 128) ||
    !/^[1-9][0-9]{0,18}$/.test(payment.amountMinor) ||
    BigInt(payment.amountMinor) > MAX_MONEY
  )
    return { ok: false, error: 'InvalidPaymentObservation' };
  if (
    payment.reference !== order.reference ||
    (order.providerPaymentId !== null && order.providerPaymentId !== payment.id)
  )
    return { ok: false, error: 'PaymentIdentityMismatch' };
  if (payment.currency !== order.currency)
    return { ok: false, error: 'PaymentCurrencyMismatch' };
  if (payment.amountMinor !== order.totalMinor)
    return { ok: false, error: 'PaymentAmountMismatch' };

  const providerPaymentId = payment.id;
  // Una anulación del intento libera reserva; no implementa devoluciones de pedidos aprobados.
  const finalStatus = payment.status === 'VOIDED' ? 'DECLINED' : payment.status;
  if (order.status !== 'PENDING') {
    const expectedReservation =
      order.status === 'APPROVED' ? 'CONFIRMED' : 'RELEASED';
    return order.status === finalStatus &&
      order.reservationStatus === expectedReservation &&
      order.providerPaymentId === providerPaymentId
      ? { ok: true, value: { kind: 'already-applied', providerPaymentId } }
      : { ok: false, error: 'InvalidPaymentState' };
  }
  if (order.reservationStatus !== 'ACTIVE')
    return { ok: false, error: 'InvalidPaymentState' };
  if (finalStatus === 'PENDING')
    return { ok: true, value: { kind: 'pending', providerPaymentId } };
  if (finalStatus === 'APPROVED')
    return { ok: true, value: { kind: 'confirm', providerPaymentId } };
  return {
    ok: true,
    value: { kind: 'release', status: finalStatus, providerPaymentId },
  };
}
