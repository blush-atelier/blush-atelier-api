import { createHash } from 'node:crypto';
import {
  WompiCheckout,
  WompiEvents,
  WompiGateway,
  wompiSettings,
} from '../src/payments/infrastructure/wompi';
import { settings, data, eventBody } from './payment-fixtures';
it('rechaza configuración no Sandbox y mantiene catálogo disponible con pago desactivado', () => {
  expect(wompiSettings({}).enabled).toBe(false);
  expect(() => wompiSettings({ WOMPI_ENABLED: 'yes' })).toThrow('Invalid');
  expect(() => wompiSettings({ WOMPI_ENABLED: 'true' })).toThrow('Sandbox');
  expect(() =>
    wompiSettings({ WOMPI_ENABLED: 'true', WOMPI_PUBLIC_KEY: 'pub_prod_x' }),
  ).toThrow('Sandbox');
});
it('firma referencia/importe/moneda/expiración y no expone secretos', () => {
  const session = new WompiCheckout(settings).create(
    data.reference,
    '10490000',
    '2026-11-13T23:59:00.000Z',
  );
  expect(session).toEqual({
    ok: true,
    value: {
      reference: data.reference,
      amountMinor: '10490000',
      currency: 'COP',
      publicKey: settings.publicKey,
      expiresAt: '2026-11-13T23:59:00.000Z',
      integrity: createHash('sha256')
        .update(
          `${data.reference}10490000COP2026-11-13T23:59:00.000Z${settings.integritySecret}`,
        )
        .digest('hex'),
    },
  });
  expect(JSON.stringify(session)).not.toContain(settings.privateKey);
  expect(
    new WompiCheckout(settings).create(data.reference, '9007199254740993', 'x'),
  ).toEqual({ ok: false, error: 'AmountOutOfRange' });
  expect(
    new WompiCheckout(settings).create(data.reference, 'invalid', 'x').ok,
  ).toBe(false);
});
it('consulta URL Sandbox con llave privada y proyecta solo campos seguros', async () => {
  const request = jest.fn().mockResolvedValue(
    new Response(
      JSON.stringify({
        data: {
          ...data,
          customer_email: 'private@example.com',
          payment_method: { number: 'do-not-propagate' },
        },
      }),
    ),
  );
  const result = await new WompiGateway(settings, request).getPayment(data.id);
  expect(request).toHaveBeenCalledWith(
    'https://sandbox.wompi.co/v1/transactions/payment-1',
    expect.objectContaining({
      headers: {
        Authorization: `Bearer ${settings.privateKey}`,
        Accept: 'application/json',
      },
      redirect: 'error',
      signal: expect.any(AbortSignal),
    }),
  );
  expect(result).toEqual({
    ok: true,
    value: {
      id: data.id,
      reference: data.reference,
      amountMinor: '10490000',
      currency: 'COP',
      status: 'APPROVED',
    },
  });
});
it.each([404, 401, 429, 500])(
  'traduce HTTP %s sin reflejar respuesta',
  async (status) => {
    const request = jest
      .fn()
      .mockResolvedValue(new Response('private provider detail', { status }));
    expect(
      await new WompiGateway(settings, request).getPayment(data.id),
    ).toEqual({
      ok: false,
      error: status === 404 ? 'PaymentNotFound' : 'PaymentProviderUnavailable',
    });
  },
);
it.each([
  { id: 'other' },
  { reference: '' },
  { currency: 'USD' },
  { amount_in_cents: 9007199254740992 },
  { amount_in_cents: 1.5 },
  { status: 'UNKNOWN' },
])('rechaza respuesta mal formada %p', async (changes) => {
  const request = jest
    .fn()
    .mockResolvedValue(
      new Response(JSON.stringify({ data: { ...data, ...changes } })),
    );
  expect(await new WompiGateway(settings, request).getPayment(data.id)).toEqual(
    { ok: false, error: 'InvalidProviderResponse' },
  );
});
it('timeout/JSON inválido son fallos técnicos y no un pago ERROR', async () => {
  const request = jest
    .fn()
    .mockRejectedValue(new Error('timeout private context'));
  expect(await new WompiGateway(settings, request).getPayment(data.id)).toEqual(
    { ok: false, error: 'PaymentProviderUnavailable' },
  );
  request.mockResolvedValue(new Response('not json'));
  expect(await new WompiGateway(settings, request).getPayment(data.id)).toEqual(
    { ok: false, error: 'PaymentProviderUnavailable' },
  );
  expect(
    await new WompiGateway(settings, request).getPayment('../wrong'),
  ).toEqual({ ok: false, error: 'InvalidPaymentInput' });
});
it('no hace red ni firma con pago deshabilitado', async () => {
  const disabled = { ...settings, enabled: false };
  const request = jest.fn();
  expect(await new WompiGateway(disabled, request).getPayment(data.id)).toEqual(
    { ok: false, error: 'PaymentNotConfigured' },
  );
  expect(new WompiCheckout(disabled).create('x', '1', 'x')).toEqual({
    ok: false,
    error: 'PaymentNotConfigured',
  });
  expect(new WompiEvents(disabled).verify({})).toEqual({
    ok: false,
    error: 'PaymentNotConfigured',
  });
  expect(request).not.toHaveBeenCalled();
});
it('valida checksum en el orden recibido y acepta reintentos sin depender de sent_at', () => {
  expect(new WompiEvents(settings).verify(eventBody())).toEqual({
    ok: true,
    value: { providerPaymentId: data.id },
  });
  expect(
    new WompiEvents(settings).verify({ ...eventBody(), sent_at: 'later' }).ok,
  ).toBe(true);
});
it.each([
  null,
  {},
  { ...eventBody(), environment: 'prod' },
  { ...eventBody(), event: 'other' },
  { ...eventBody(), timestamp: 0 },
  { ...eventBody(), data: { transaction: { id: '../wrong' } } },
  {
    ...eventBody(),
    signature: { properties: ['transaction.id'], checksum: 'wrong' },
  },
  {
    ...eventBody(),
    signature: {
      properties: ['transaction.__proto__.x', 'transaction.id'],
      checksum: '0'.repeat(64),
    },
  },
  {
    ...eventBody(),
    signature: {
      properties: ['transaction.amount_in_cents'],
      checksum: '0'.repeat(64),
    },
  },
  {
    ...eventBody(),
    signature: {
      properties: ['transaction.id', 'transaction.missing'],
      checksum: '0'.repeat(64),
    },
  },
  {
    ...eventBody(),
    signature: {
      properties: ['transaction.id', 'transaction'],
      checksum: '0'.repeat(64),
    },
  },
])('rechaza evento mal formado o no auténtico', (body) => {
  expect(new WompiEvents(settings).verify(body)).toEqual({
    ok: false,
    error: 'InvalidWebhook',
  });
});
it('un estado alterado invalida la firma', () => {
  const body = eventBody();
  body.data.transaction.status = 'DECLINED';
  expect(new WompiEvents(settings).verify(body)).toEqual({
    ok: false,
    error: 'InvalidWebhook',
  });
});

it('identifica la variable inválida sin incluir su valor en el error', () => {
  const env = {
    WOMPI_ENABLED: 'true',
    WOMPI_PUBLIC_KEY: 'pub_test_fixture',
    WOMPI_PRIVATE_KEY: 'prv_test_fixture',
    WOMPI_INTEGRITY_SECRET: 'test_integrity_fixture',
    WOMPI_EVENTS_SECRET: 'test_events_fixture',
  };
  for (const variable of [
    'WOMPI_PUBLIC_KEY',
    'WOMPI_PRIVATE_KEY',
    'WOMPI_INTEGRITY_SECRET',
    'WOMPI_EVENTS_SECRET',
  ] as const) {
    const invalid = 'DO NOT EXPOSE THIS VALUE';
    try {
      wompiSettings({ ...env, [variable]: invalid });
      throw new Error('expected configuration rejection');
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toContain(variable);
      expect((error as Error).message).not.toContain(invalid);
    }
  }
});

it('consulta UAT Sandbox configurado y acepta credenciales stagtest sin inventar prefijos de secretos', async () => {
  const configured = wompiSettings({
    WOMPI_ENABLED: 'true',
    UAT_URL: 'https://api.co.uat.wompi.dev/v1',
    UAT_SANDBOX_URL: 'https://api-sandbox.co.uat.wompi.dev/v1/',
    WOMPI_PUBLIC_KEY: 'pub_stagtest_fixture',
    WOMPI_PRIVATE_KEY: 'prv_stagtest_fixture',
    WOMPI_INTEGRITY_SECRET: 'stagtest_integrity_fixture',
    WOMPI_EVENTS_SECRET: 'stagtest_events_fixture',
  });
  const request = jest
    .fn()
    .mockResolvedValue(new Response(JSON.stringify({ data })));
  expect(
    (await new WompiGateway(configured, request).getPayment(data.id)).ok,
  ).toBe(true);
  expect(request.mock.calls[0][0]).toBe(
    'https://api-sandbox.co.uat.wompi.dev/v1/transactions/payment-1',
  );
  const stagedEvent = eventBody();
  stagedEvent.environment = 'stagtest';
  stagedEvent.signature.checksum = createHash('sha256')
    .update(
      `${data.status}${data.amount_in_cents}${data.id}${stagedEvent.timestamp}${configured.eventsSecret}`,
    )
    .digest('hex');
  expect(new WompiEvents(configured).verify(stagedEvent).ok).toBe(true);
  expect(new WompiEvents(settings).verify(stagedEvent).ok).toBe(false);
  expect(
    new WompiCheckout(configured).create('ref', '100', '2099-01-01T00:00:00Z')
      .ok,
  ).toBe(true);
});
it('WOMPI_API_URL prevalece sobre UAT_SANDBOX_URL y bloquea destinos de producción/arbitrarios', () => {
  const env = {
    WOMPI_ENABLED: 'true',
    WOMPI_PUBLIC_KEY: 'pub_test_fixture',
    WOMPI_PRIVATE_KEY: 'prv_test_fixture',
    WOMPI_INTEGRITY_SECRET: 'opaque-fixture',
    WOMPI_EVENTS_SECRET: 'another-fixture',
    UAT_SANDBOX_URL: 'https://api-sandbox.co.uat.wompi.dev/v1',
  };
  expect(
    wompiSettings({ ...env, WOMPI_API_URL: 'https://sandbox.wompi.co/v1/' })
      .apiUrl,
  ).toBe('https://sandbox.wompi.co/v1');
  for (const url of [
    'https://production.wompi.co/v1',
    'https://api.co.uat.wompi.dev/v1',
    'https://attacker.example/v1',
    'http://api-sandbox.co.uat.wompi.dev/v1',
  ])
    expect(() => wompiSettings({ ...env, WOMPI_API_URL: url })).toThrow(
      'Sandbox endpoint',
    );
  expect(() =>
    wompiSettings({ ...env, WOMPI_PRIVATE_KEY: 'prv_stagtest_fixture' }),
  ).toThrow('same test environment');
  expect(() =>
    wompiSettings({
      ...env,
      WOMPI_API_URL: 'https://sandbox.wompi.co/v1',
      WOMPI_PUBLIC_KEY: 'pub_stagtest_fixture',
      WOMPI_PRIVATE_KEY: 'prv_stagtest_fixture',
    }),
  ).toThrow('UAT Sandbox');
  expect(() =>
    wompiSettings({ ...env, WOMPI_INTEGRITY_SECRET: 'prod_integrity_fixture' }),
  ).toThrow('WOMPI_INTEGRITY_SECRET');
});
