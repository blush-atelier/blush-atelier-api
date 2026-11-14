import {
  decidePaymentTransition,
  type PaymentOrder,
} from '../src/payments/domain/payment-transition';
import type { PaymentObservation } from '../src/payments/domain/payment-gateway.port';

const order: PaymentOrder = {
  reference: 'BA-local-order',
  totalMinor: '10490000',
  currency: 'COP',
  status: 'PENDING',
  reservationStatus: 'ACTIVE',
  providerPaymentId: null,
};
const payment: PaymentObservation = {
  id: 'sandbox-payment-id',
  reference: order.reference,
  amountMinor: order.totalMinor,
  currency: 'COP',
  status: 'APPROVED',
};

it('propone confirmar un pago aprobado sin mutar pedido ni observación', () => {
  const before = structuredClone({ order, payment });
  expect(
    decidePaymentTransition(Object.freeze(order), Object.freeze(payment)),
  ).toEqual({
    ok: true,
    value: { kind: 'confirm', providerPaymentId: payment.id },
  });
  expect({ order, payment }).toEqual(before);
});
it('conserva PENDING y la reserva mientras el proveedor no tenga un resultado final', () => {
  expect(
    decidePaymentTransition(order, { ...payment, status: 'PENDING' }),
  ).toEqual({
    ok: true,
    value: { kind: 'pending', providerPaymentId: payment.id },
  });
});
it.each(['DECLINED', 'ERROR', 'VOIDED'] as const)(
  'propone liberar solo ante resultado definitivo %s',
  (status) => {
    expect(decidePaymentTransition(order, { ...payment, status })).toEqual({
      ok: true,
      value: {
        kind: 'release',
        status: status === 'VOIDED' ? 'DECLINED' : status,
        providerPaymentId: payment.id,
      },
    });
  },
);
it.each(['APPROVED', 'DECLINED', 'ERROR'] as const)(
  'un duplicado %s ya aplicado no propone otro movimiento de stock',
  (status) => {
    expect(
      decidePaymentTransition(
        {
          ...order,
          status,
          providerPaymentId: payment.id,
          reservationStatus: status === 'APPROVED' ? 'CONFIRMED' : 'RELEASED',
        },
        { ...payment, status },
      ),
    ).toEqual({
      ok: true,
      value: { kind: 'already-applied', providerPaymentId: payment.id },
    });
  },
);
it('repetir VOIDED no vuelve a liberar una reserva anulada', () => {
  expect(
    decidePaymentTransition(
      {
        ...order,
        status: 'DECLINED',
        reservationStatus: 'RELEASED',
        providerPaymentId: payment.id,
      },
      { ...payment, status: 'VOIDED' },
    ),
  ).toMatchObject({ ok: true, value: { kind: 'already-applied' } });
});
it.each([{ reference: 'another-order' }, { id: 'another-payment' }])(
  'rechaza una observación de otra compra/intento %p',
  (changes) => {
    expect(
      decidePaymentTransition(
        { ...order, providerPaymentId: payment.id },
        { ...payment, ...changes },
      ),
    ).toEqual({ ok: false, error: 'PaymentIdentityMismatch' });
  },
);
it('rechaza importe o moneda distintos, incluso en un duplicado', () => {
  expect(
    decidePaymentTransition(order, { ...payment, amountMinor: '1' }),
  ).toEqual({ ok: false, error: 'PaymentAmountMismatch' });
  expect(
    decidePaymentTransition(order, { ...payment, currency: 'USD' }),
  ).toEqual({ ok: false, error: 'PaymentCurrencyMismatch' });
  expect(
    decidePaymentTransition(
      {
        ...order,
        status: 'APPROVED',
        reservationStatus: 'CONFIRMED',
        providerPaymentId: payment.id,
      },
      { ...payment, amountMinor: '1' },
    ),
  ).toEqual({ ok: false, error: 'PaymentAmountMismatch' });
});
it.each([
  '',
  '0',
  '-1',
  '01',
  '1.5',
  'NaN',
  '9223372036854775808',
  '1'.repeat(20),
])('rechaza centavos inválidos %s', (amountMinor) => {
  expect(decidePaymentTransition(order, { ...payment, amountMinor })).toEqual({
    ok: false,
    error: 'InvalidPaymentObservation',
  });
});
it('no acepta una observación sin identificador válido', () => {
  expect(decidePaymentTransition(order, { ...payment, id: '' })).toEqual({
    ok: false,
    error: 'InvalidPaymentObservation',
  });
});
it('compara centavos más allá de Number.MAX_SAFE_INTEGER sin redondear', () => {
  const large = '9007199254740993';
  expect(
    decidePaymentTransition(
      { ...order, totalMinor: large },
      { ...payment, amountMinor: large },
    ),
  ).toMatchObject({ ok: true });
  expect(
    decidePaymentTransition(
      { ...order, totalMinor: large },
      { ...payment, amountMinor: '9007199254740992' },
    ),
  ).toEqual({ ok: false, error: 'PaymentAmountMismatch' });
});
it.each([
  { status: 'EXPIRED', reservationStatus: 'RELEASED' },
  { status: 'PENDING', reservationStatus: 'RELEASED' },
  { status: 'PENDING', reservationStatus: 'CONFIRMED' },
  { status: 'APPROVED', reservationStatus: 'ACTIVE' },
  { status: 'APPROVED', reservationStatus: 'RELEASED' },
  { status: 'DECLINED', reservationStatus: 'CONFIRMED' },
] as const)(
  'no confirma una reserva inconsistente o liberada: %p',
  (changes) => {
    expect(
      decidePaymentTransition(
        { ...order, ...changes, providerPaymentId: payment.id },
        payment,
      ),
    ).toEqual({ ok: false, error: 'InvalidPaymentState' });
  },
);
it.each(['PENDING', 'DECLINED', 'ERROR', 'VOIDED'] as const)(
  'un resultado %s tardío no revierte una aprobación',
  (status) => {
    expect(
      decidePaymentTransition(
        {
          ...order,
          status: 'APPROVED',
          reservationStatus: 'CONFIRMED',
          providerPaymentId: payment.id,
        },
        { ...payment, status },
      ),
    ).toEqual({ ok: false, error: 'InvalidPaymentState' });
  },
);
it('no trata como duplicado un estado final sin enlace al pago guardado', () => {
  expect(
    decidePaymentTransition(
      { ...order, status: 'APPROVED', reservationStatus: 'CONFIRMED' },
      payment,
    ),
  ).toEqual({ ok: false, error: 'InvalidPaymentState' });
});
