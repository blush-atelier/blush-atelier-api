import {
  ChargeCard,
  GetCardConfiguration,
} from '../src/payments/application/charge-card';
import type {
  CardAuthorization,
  CardChargeRequest,
} from '../src/payments/domain/card-payments.port';
import type {
  PaymentRecord,
  PaymentStore,
  PaymentUnitOfWork,
  PaymentResult,
} from '../src/payments/domain/payment-ports';
import { WompiCards } from '../src/payments/infrastructure/wompi-cards';
import { settings, data } from './payment-fixtures';
export const authorization: CardAuthorization = {
  token: 'tok_stagtest_fixture',
  acceptanceToken: 'privacy-token',
  personalDataToken: 'personal-token',
  installments: 1,
  privacyAccepted: true,
  personalDataAccepted: true,
};
const snapshot: PaymentRecord = {
  id: 'order',
  customerId: 'customer',
  customerEmail: 'customer@example.com',
  deliveryId: 'delivery',
  reference: data.reference,
  totalMinor: String(data.amount_in_cents),
  currency: 'COP',
  status: 'PENDING',
  reservationStatus: 'ACTIVE',
  providerPaymentId: null,
  paymentStartedAt: null,
  paymentSubmittedAt: null,
  paymentExpiresAt: null,
  reservationExpiresAt: '2099-01-01T00:00:00Z',
};
function fixture(changes: Partial<PaymentRecord> = {}) {
  const current = { ...snapshot, ...changes };
  const store: PaymentStore = {
    find: jest.fn().mockResolvedValue(current),
    findByReference: jest.fn().mockResolvedValue(current),
    start: jest.fn(),
    claimSubmission: jest.fn().mockImplementation(async () => {
      current.paymentSubmittedAt = 'started';
      current.paymentStartedAt = 'started';
    }),
    apply: jest.fn(),
  };
  const unit: PaymentUnitOfWork = {
    run: async <T>(work: (s: PaymentStore) => Promise<PaymentResult<T>>) =>
      work(store),
  };
  const observed = {
    id: data.id,
    reference: data.reference,
    amountMinor: String(data.amount_in_cents),
    currency: 'COP',
    status: 'APPROVED',
  };
  const gateway = {
    enabled: true,
    configuration: jest.fn(),
    charge: jest.fn().mockResolvedValue({ ok: true, value: observed }),
  };
  const runtime = {
    now: () => new Date('2026-11-13T00:00:00Z'),
    id: () => '',
    token: () => '',
    hash: () => '',
  };
  return {
    current,
    store,
    unit,
    gateway,
    runtime,
    observed,
    uc: new ChargeCard(unit, gateway, runtime),
  };
}
it('confirma PENDING/claim antes del POST; segundo envío no vuelve a llamar al proveedor', async () => {
  const f = fixture();
  expect(
    await f.uc.execute('customer', 'order', authorization, '127.0.0.1'),
  ).toEqual({ ok: true, value: { accepted: true } });
  expect(f.store.claimSubmission).toHaveBeenCalled();
  expect(f.gateway.charge).toHaveBeenCalledWith(
    expect.objectContaining({
      reference: snapshot.reference,
      customerEmail: snapshot.customerEmail,
      amountMinor: snapshot.totalMinor,
      token: authorization.token,
    }),
  );
  expect(
    await f.uc.execute('customer', 'order', authorization, '127.0.0.1'),
  ).toEqual({ ok: true, value: { accepted: true } });
  expect(f.gateway.charge).toHaveBeenCalledTimes(1);
});
it.each([
  { token: 'tok_prod_no' },
  { installments: 0 },
  { installments: 1.5 },
  { installments: 37 },
  { privacyAccepted: false },
  { personalDataAccepted: false },
  { acceptanceToken: '' },
  { personalDataToken: 'bad token' },
])('rechaza autorización incompleta %p antes de claim', async (changes) => {
  const f = fixture();
  expect(
    await f.uc.execute(
      'customer',
      'order',
      { ...authorization, ...changes },
      '127.0.0.1',
    ),
  ).toEqual({ ok: false, error: 'InvalidPaymentInput' });
  expect(f.store.claimSubmission).not.toHaveBeenCalled();
});
it.each([
  { status: 'APPROVED' },
  { reservationStatus: 'RELEASED' },
  { providerPaymentId: 'previous' },
  { paymentStartedAt: 'legacy' },
  { reservationExpiresAt: '2020-01-01T00:00:00Z' },
] as Partial<PaymentRecord>[])(
  'no duplica intentos ni cobra reservas inválidas %p',
  async (changes) => {
    const f = fixture(changes);
    expect(
      (await f.uc.execute('customer', 'order', authorization, '127.0.0.1')).ok,
    ).toBe(false);
    expect(f.gateway.charge).not.toHaveBeenCalled();
  },
);
it('no modifica pedidos ajenos ni interpreta timeout como rechazo', async () => {
  const f = fixture();
  jest.mocked(f.store.find).mockResolvedValueOnce(null);
  expect(
    await f.uc.execute('other', 'order', authorization, '127.0.0.1'),
  ).toEqual({ ok: false, error: 'TransactionNotFound' });
  f.gateway.charge.mockResolvedValueOnce({
    ok: false,
    error: 'PaymentProviderUnavailable',
  });
  expect(
    await f.uc.execute('customer', 'order', authorization, '127.0.0.1'),
  ).toEqual({ ok: false, error: 'PaymentProviderUnavailable' });
  expect(f.store.apply).not.toHaveBeenCalled();
  await f.uc.execute('customer', 'order', authorization, '127.0.0.1');
  expect(f.gateway.charge).toHaveBeenCalledTimes(1);
});
it('rechaza desajuste monetario, desaparición del pedido y preserva finalización de webhook anterior', async () => {
  const f = fixture();
  f.gateway.charge.mockResolvedValueOnce({
    ok: true,
    value: { ...f.observed, amountMinor: '1' },
  });
  expect(
    await f.uc.execute('customer', 'order', authorization, '127.0.0.1'),
  ).toEqual({ ok: false, error: 'PaymentAmountMismatch' });
  const missing = fixture();
  jest
    .mocked(missing.store.find)
    .mockResolvedValueOnce(missing.current)
    .mockResolvedValueOnce(null);
  expect(
    await missing.uc.execute('customer', 'order', authorization, '127.0.0.1'),
  ).toEqual({ ok: false, error: 'TransactionNotFound' });
  const raced = fixture();
  raced.gateway.charge.mockImplementationOnce(async () => {
    raced.current.status = 'APPROVED';
    raced.current.reservationStatus = 'CONFIRMED';
    raced.current.providerPaymentId = data.id;
    return { ok: true, value: { ...raced.observed, status: 'PENDING' } };
  });
  expect(
    (await raced.uc.execute('customer', 'order', authorization, '127.0.0.1'))
      .ok,
  ).toBe(true);
  expect(raced.store.apply).not.toHaveBeenCalled();
});
it('configuración y cargo proyectan datos mínimos y usan los secretos solo en servidor', async () => {
  const response = (value: unknown) => new Response(JSON.stringify(value));
  const request = jest
    .fn()
    .mockResolvedValueOnce(
      response({
        data: {
          presigned_acceptance: {
            permalink: 'https://example.com/privacy',
            acceptance_token: 'privacy',
          },
          presigned_personal_data_auth: {
            permalink: 'https://example.com/personal',
            acceptance_token: 'personal',
          },
          email: 'DO_NOT_EXPOSE',
        },
      }),
    )
    .mockResolvedValueOnce(
      response({
        data: {
          publicKey:
            '-----BEGIN PUBLIC KEY-----fixture-----END PUBLIC KEY-----',
        },
      }),
    );
  const cards = new WompiCards(settings, request);
  const config = await new GetCardConfiguration(cards).execute();
  expect(config.ok).toBe(true);
  expect(JSON.stringify(config)).not.toContain('DO_NOT_EXPOSE');
  expect(JSON.stringify(config)).not.toContain(settings.privateKey);
  request.mockResolvedValueOnce(response({ data }));
  const input: CardChargeRequest = {
    ...authorization,
    reference: data.reference,
    amountMinor: String(data.amount_in_cents),
    customerEmail: 'customer@example.com',
    clientIp: '127.0.0.1',
  };
  expect((await cards.charge(input)).ok).toBe(true);
  const call = request.mock.calls[2];
  expect(call[0]).toBe(settings.apiUrl + '/transactions');
  const body = JSON.parse(call[1].body);
  expect(body.payment_method).toEqual({
    type: 'CARD',
    token: authorization.token,
    installments: 1,
  });
  expect(body).not.toHaveProperty('number');
  expect(body).not.toHaveProperty('cvc');
  expect(call[1].headers.Authorization).toBe('Bearer ' + settings.privateKey);
  request.mockResolvedValueOnce(
    new Response('provider details', { status: 422 }),
  );
  expect(await cards.charge(input)).toEqual({
    ok: false,
    error: 'PaymentProviderUnavailable',
  });
  request.mockRejectedValueOnce(new Error('network'));
  expect((await cards.charge(input)).ok).toBe(false);
  expect(
    (await cards.charge({ ...input, amountMinor: '9007199254740993' })).ok,
  ).toBe(false);
});
it('configuración mal formada o deshabilitada nunca filtra respuestas', async () => {
  const request = jest
    .fn()
    .mockImplementation(async () => new Response(JSON.stringify({ data: {} })));
  const cards = new WompiCards(settings, request);
  expect(await cards.configuration()).toEqual({
    ok: false,
    error: 'InvalidProviderResponse',
  });
  request.mockResolvedValue(new Response('detail', { status: 500 }));
  expect(await cards.configuration()).toEqual({
    ok: false,
    error: 'PaymentProviderUnavailable',
  });
  request.mockRejectedValue(new Error('private'));
  expect(await cards.configuration()).toEqual({
    ok: false,
    error: 'PaymentProviderUnavailable',
  });
  const disabled = new WompiCards({ ...settings, enabled: false }, request);
  expect(await disabled.configuration()).toEqual({
    ok: false,
    error: 'PaymentNotConfigured',
  });
  expect(await disabled.charge({} as CardChargeRequest)).toEqual({
    ok: false,
    error: 'PaymentNotConfigured',
  });
});

it('proveedor deshabilitado no deja un pedido marcado como enviado', async () => {
  const f = fixture();
  f.gateway.enabled = false;
  expect(
    await f.uc.execute('customer', 'order', authorization, '127.0.0.1'),
  ).toEqual({ ok: false, error: 'PaymentNotConfigured' });
  expect(f.store.claimSubmission).not.toHaveBeenCalled();
});

it('importe no representable por JSON numérico no marca envío ni llama al proveedor', async () => {
  const f = fixture({ totalMinor: '9007199254740993' });
  expect(
    await f.uc.execute('customer', 'order', authorization, '127.0.0.1'),
  ).toEqual({ ok: false, error: 'AmountOutOfRange' });
  expect(f.store.claimSubmission).not.toHaveBeenCalled();
});
