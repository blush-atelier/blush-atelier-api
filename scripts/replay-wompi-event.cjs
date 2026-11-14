const { createHash } = require('node:crypto');

async function replay({
  args = process.argv.slice(2),
  env = process.env,
  request = fetch,
  write = console.log,
  adapters = () => require('../dist/payments/infrastructure/wompi'),
} = {}) {
  const values = new Map();
  for (let i = 0; i < args.length; i++) {
    const name = args[i];
    if (
      !['--transaction', '--url', '--send'].includes(name) ||
      values.has(name)
    )
      throw new Error('Invalid arguments');
    if (name === '--send') values.set(name, true);
    else {
      const value = args[++i];
      if (!value || value.startsWith('--')) throw new Error('Missing argument');
      values.set(name, value);
    }
  }
  const id = values.get('--transaction');
  if (typeof id !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(id))
    throw new Error('Invalid transaction ID');
  const url = new URL(values.get('--url'));
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (
    (url.protocol !== 'https:' && !(local && url.protocol === 'http:')) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== '/api/payments/wompi/events'
  )
    throw new Error('Invalid webhook URL');
  const { wompiSettings, WompiGateway, WompiEvents } = adapters();
  const settings = wompiSettings(env);
  if (!settings.enabled) throw new Error('Sandbox must be enabled');
  if (!values.get('--send')) {
    write(
      JSON.stringify({
        mode: 'dry-run',
        target: url.href,
        sendsPayment: false,
        sendsWebhook: false,
      }),
    );
    return;
  }
  // Solo consulta un pago existente; nunca crea un cargo en Wompi.
  const payment = await new WompiGateway(settings, request).getPayment(id);
  if (!payment.ok) throw new Error(payment.error);
  const transaction = {
    id: payment.value.id,
    status: payment.value.status,
    amount_in_cents: Number(payment.value.amountMinor),
    reference: payment.value.reference,
    currency: payment.value.currency,
  };
  const properties = [
    'transaction.id',
    'transaction.status',
    'transaction.amount_in_cents',
  ];
  const timestamp = Math.floor(Date.now() / 1000);
  const checksum = createHash('sha256')
    .update(
      `${transaction.id}${transaction.status}${transaction.amount_in_cents}${timestamp}${settings.eventsSecret}`,
    )
    .digest('hex');
  const body = {
    event: 'transaction.updated',
    environment: 'test',
    data: { transaction },
    timestamp,
    signature: { properties, checksum },
  };
  if (!new WompiEvents(settings).verify(body).ok)
    throw new Error('Invalid generated event');
  const response = await request(url.href, {
    method: 'POST',
    redirect: 'error',
    signal: AbortSignal.timeout(15000),
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  // La respuesta no se imprime: un proxy podría reflejar el payload firmado.
  write(
    JSON.stringify({
      mode: 'sent',
      status: response.status,
      sendsPayment: false,
    }),
  );
  if (response.status !== 200) throw new Error('Webhook replay failed');
}
module.exports = { replay };
if (require.main === module)
  replay().catch(() => {
    console.error(
      'No se pudo verificar el webhook. Revisa argumentos, build y configuracion Sandbox; no compartas secretos.',
    );
    process.exitCode = 1;
  });
