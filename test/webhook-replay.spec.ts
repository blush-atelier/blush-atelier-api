import { createHash } from 'node:crypto';
import * as adapters from '../src/payments/infrastructure/wompi';
import { settings, data } from './payment-fixtures';
// CLI operativo: usa el mismo adaptador de produccion, con HTTP simulado.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { replay } = require('../scripts/replay-wompi-event.cjs');
const env = {
  WOMPI_ENABLED: 'true',
  WOMPI_PUBLIC_KEY: settings.publicKey,
  WOMPI_PRIVATE_KEY: settings.privateKey,
  WOMPI_EVENTS_SECRET: settings.eventsSecret,
  WOMPI_INTEGRITY_SECRET: settings.integritySecret,
};
const args = [
  '--transaction',
  data.id,
  '--url',
  'https://shop.example/api/payments/wompi/events',
];
const dependencies = () => ({
  env,
  adapters: () => adapters,
  write: jest.fn(),
  request: jest.fn(),
});
it('por defecto no hace red ni imprime datos firmados', async () => {
  const d = dependencies();
  await replay({ ...d, args });
  expect(d.request).not.toHaveBeenCalled();
  expect(JSON.parse(d.write.mock.calls[0][0])).toMatchObject({
    mode: 'dry-run',
    sendsPayment: false,
    sendsWebhook: false,
  });
});
it('consulta Sandbox y reenvia una firma valida sin crear otro pago', async () => {
  const d = dependencies();
  d.request
    .mockResolvedValueOnce(new Response(JSON.stringify({ data })))
    .mockResolvedValueOnce(new Response('{}'));
  await replay({ ...d, args: [...args, '--send'] });
  expect(d.request).toHaveBeenCalledTimes(2);
  expect(d.request.mock.calls[0][0]).toBe(
    'https://sandbox.wompi.co/v1/transactions/payment-1',
  );
  expect(d.request.mock.calls[0][1].method).toBeUndefined();
  const event = JSON.parse(d.request.mock.calls[1][1].body);
  expect(new adapters.WompiEvents(settings).verify(event).ok).toBe(true);
  const hash = createHash('sha256')
    .update(
      `${data.id}${data.status}${data.amount_in_cents}${event.timestamp}${settings.eventsSecret}`,
    )
    .digest('hex');
  expect(event.signature.checksum).toBe(hash);
  const output = JSON.stringify(d.write.mock.calls);
  for (const privateValue of [
    settings.privateKey,
    settings.eventsSecret,
    hash,
    data.id,
  ])
    expect(output).not.toContain(privateValue);
});
it('no envia un evento si el proveedor no confirma la transaccion', async () => {
  const d = dependencies();
  d.request.mockResolvedValueOnce(new Response('{}', { status: 404 }));
  await expect(replay({ ...d, args: [...args, '--send'] })).rejects.toThrow(
    'PaymentNotFound',
  );
  expect(d.request).toHaveBeenCalledTimes(1);
});
it('no acepta endpoints reales de Wompi ni destinos HTTP remotos', async () => {
  const d = dependencies();
  await expect(
    replay({
      ...d,
      env: { ...env, WOMPI_API_URL: 'https://production.wompi.co/v1' },
      args,
    }),
  ).rejects.toThrow('Sandbox endpoint');
  await expect(
    replay({
      ...d,
      args: [
        '--transaction',
        data.id,
        '--url',
        'http://shop.example/api/payments/wompi/events',
      ],
    }),
  ).rejects.toThrow('Invalid webhook URL');
  expect(d.request).not.toHaveBeenCalled();
});
it('un fallo del receptor se informa sin imprimir su cuerpo', async () => {
  const d = dependencies();
  d.request
    .mockResolvedValueOnce(new Response(JSON.stringify({ data })))
    .mockResolvedValueOnce(
      new Response('PRIVATE_RESPONSE_MARKER', { status: 503 }),
    );
  await expect(replay({ ...d, args: [...args, '--send'] })).rejects.toThrow(
    'Webhook replay failed',
  );
  expect(JSON.stringify(d.write.mock.calls)).not.toContain(
    'PRIVATE_RESPONSE_MARKER',
  );
});
