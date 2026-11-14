import { PreparePayment } from '../src/payments/application/prepare-payment';
import {
  VerifyPayment,
  ProcessPaymentEvent,
} from '../src/payments/application/verify-payment';
import type {
  PaymentRecord,
  PaymentStore,
  PaymentUnitOfWork,
  PaymentResult,
} from '../src/payments/domain/payment-ports';
import {
  WompiCheckout,
  WompiEvents,
} from '../src/payments/infrastructure/wompi';
import { settings, eventBody, data } from './payment-fixtures';
const order: PaymentRecord = {
  id: 'order',
  customerId: 'customer',
  deliveryId: 'delivery',
  reference: data.reference,
  totalMinor: '10490000',
  currency: 'COP',
  status: 'PENDING',
  reservationStatus: 'ACTIVE',
  providerPaymentId: null,
  reservationExpiresAt: '2026-11-13T23:59:00.000Z',
  paymentStartedAt: null,
  paymentSubmittedAt: null,
  customerEmail: 'checkout@example.com',
  paymentExpiresAt: null,
};
function fixture(changes: Partial<PaymentRecord> = {}) {
  const current = { ...order, ...changes };
  const store: PaymentStore = {
    find: jest.fn().mockResolvedValue(current),
    findByReference: jest.fn().mockResolvedValue(current),
    claimSubmission: jest.fn().mockResolvedValue(undefined),
    start: jest.fn().mockResolvedValue(undefined),
    apply: jest.fn().mockResolvedValue(undefined),
  };
  const unit: PaymentUnitOfWork = {
    run: async <T>(work: (s: PaymentStore) => Promise<PaymentResult<T>>) =>
      work(store),
  };
  const gateway = {
    getPayment: jest.fn().mockResolvedValue({
      ok: true,
      value: {
        id: data.id,
        reference: data.reference,
        amountMinor: order.totalMinor,
        currency: 'COP',
        status: 'APPROVED',
      },
    }),
  };
  const runtime = {
    now: () => new Date('2026-11-13T23:00:00.000Z'),
    id: () => '',
    token: () => '',
    hash: () => '',
  };
  return { current, store, unit, gateway, runtime };
}
it('prepara un solo intento y reutiliza su vencimiento y firma', async () => {
  const f = fixture();
  const uc = new PreparePayment(f.unit, new WompiCheckout(settings), f.runtime);
  const result = await uc.execute('customer', 'order');
  expect(result.ok).toBe(true);
  expect(f.store.start).toHaveBeenCalledWith(
    order.id,
    f.runtime.now(),
    order.reservationExpiresAt,
  );
  f.current.paymentStartedAt = f.runtime.now().toISOString();
  f.current.paymentExpiresAt = order.reservationExpiresAt;
  expect(await uc.execute('customer', 'order')).toEqual(result);
  expect(f.store.start).toHaveBeenCalledTimes(1);
});
it.each([
  { status: 'APPROVED' },
  { reservationStatus: 'RELEASED' },
  { providerPaymentId: 'known' },
] as Partial<PaymentRecord>[])(
  'no inicia un estado incompatible %p',
  async (changes) => {
    const f = fixture(changes);
    expect(
      await new PreparePayment(
        f.unit,
        new WompiCheckout(settings),
        f.runtime,
      ).execute('customer', 'order'),
    ).toEqual({ ok: false, error: 'InvalidPaymentState' });
    expect(f.store.start).not.toHaveBeenCalled();
  },
);
it('pedido ajeno/inexistente, vencimiento y falta de configuración no inician pago', async () => {
  const f = fixture({ reservationExpiresAt: '2020-01-01T00:00:00Z' });
  const uc = new PreparePayment(f.unit, new WompiCheckout(settings), f.runtime);
  expect(await uc.execute('customer', 'order')).toEqual({
    ok: false,
    error: 'PaymentSessionExpired',
  });
  jest.mocked(f.store.find).mockResolvedValueOnce(null);
  expect(await uc.execute('other', 'order')).toEqual({
    ok: false,
    error: 'TransactionNotFound',
  });
  const valid = fixture();
  expect(
    await new PreparePayment(
      valid.unit,
      new WompiCheckout({ ...settings, enabled: false }),
      valid.runtime,
    ).execute('customer', 'order'),
  ).toEqual({ ok: false, error: 'PaymentNotConfigured' });
  expect(valid.store.start).not.toHaveBeenCalled();
});
it('consulta al proveedor y aplica la decisión después de recuperar el pedido bloqueado', async () => {
  const f = fixture({ paymentStartedAt: '2026-11-13T23:00:00Z' });
  expect(
    await new VerifyPayment(f.unit, f.gateway).execute(
      'customer',
      'order',
      data.id,
    ),
  ).toEqual({ ok: true, value: { verified: true, submitted: false } });
  expect(f.store.apply).toHaveBeenCalledWith(
    f.current,
    expect.objectContaining({ status: 'APPROVED' }),
    { kind: 'confirm', providerPaymentId: data.id },
  );
});
it('sin ID conocido espera al webhook sin inventar un resultado', async () => {
  const f = fixture();
  expect(
    await new VerifyPayment(f.unit, f.gateway).execute('customer', 'order'),
  ).toEqual({ ok: true, value: { verified: false, submitted: false } });
  expect(f.gateway.getPayment).not.toHaveBeenCalled();
});
it('rechaza ID inválido, ajeno y pago no iniciado', async () => {
  const f = fixture({ providerPaymentId: 'bound' });
  const uc = new VerifyPayment(f.unit, f.gateway);
  expect(await uc.execute('customer', 'order', '../x')).toEqual({
    ok: false,
    error: 'InvalidPaymentInput',
  });
  expect(await uc.execute('customer', 'order', 'other')).toEqual({
    ok: false,
    error: 'PaymentIdentityMismatch',
  });
  expect(await uc.execute('customer', 'order')).toEqual({
    ok: false,
    error: 'InvalidPaymentState',
  });
  jest.mocked(f.store.find).mockResolvedValueOnce(null);
  expect(await uc.execute('customer', 'missing')).toEqual({
    ok: false,
    error: 'TransactionNotFound',
  });
  expect(f.gateway.getPayment).not.toHaveBeenCalled();
});
it('no cambia stock ante timeout o importe incorrecto', async () => {
  const f = fixture({ paymentStartedAt: 'started' });
  const uc = new VerifyPayment(f.unit, f.gateway);
  f.gateway.getPayment.mockResolvedValueOnce({
    ok: false,
    error: 'PaymentProviderUnavailable',
  });
  expect(await uc.execute('customer', 'order', data.id)).toEqual({
    ok: false,
    error: 'PaymentProviderUnavailable',
  });
  expect(f.store.apply).not.toHaveBeenCalled();
  f.gateway.getPayment.mockResolvedValueOnce({
    ok: true,
    value: {
      id: data.id,
      reference: data.reference,
      amountMinor: '1',
      currency: 'COP',
      status: 'APPROVED',
    },
  });
  expect(await uc.execute('customer', 'order', data.id)).toEqual({
    ok: false,
    error: 'PaymentAmountMismatch',
  });
  expect(f.store.apply).not.toHaveBeenCalled();
});
it('webhook inválido no consulta proveedor; uno válido se confirma con API privada', async () => {
  const f = fixture({ paymentStartedAt: 'started' });
  const uc = new ProcessPaymentEvent(
    new WompiEvents(settings),
    f.gateway,
    f.unit,
  );
  expect(await uc.execute({})).toEqual({ ok: false, error: 'InvalidWebhook' });
  expect(f.gateway.getPayment).not.toHaveBeenCalled();
  expect(await uc.execute(eventBody())).toEqual({
    ok: true,
    value: { received: true, outcome: 'confirmed' },
  });
  expect(f.store.apply).toHaveBeenCalled();
});
it('webhook ignora otros pedidos pero no un inicio inconsistente', async () => {
  const f = fixture();
  const uc = new ProcessPaymentEvent(
    new WompiEvents(settings),
    f.gateway,
    f.unit,
  );
  jest.mocked(f.store.findByReference).mockResolvedValueOnce(null);
  expect(await uc.execute(eventBody())).toEqual({
    ok: true,
    value: { received: true, outcome: 'ignored' },
  });
  expect(await uc.execute(eventBody())).toEqual({
    ok: false,
    error: 'InvalidPaymentState',
  });
  f.gateway.getPayment.mockResolvedValueOnce({
    ok: false,
    error: 'PaymentProviderUnavailable',
  });
  expect(await uc.execute(eventBody())).toEqual({
    ok: false,
    error: 'PaymentProviderUnavailable',
  });
});
