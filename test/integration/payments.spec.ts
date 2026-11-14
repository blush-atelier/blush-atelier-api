import { CARD_PAYMENTS } from '../../src/payments/domain/card-payments.port';
import 'reflect-metadata';
import 'dotenv/config';
import { DataSource } from 'typeorm';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../../src/bootstrap/app.module';
import { configureApp } from '../../src/bootstrap/configure-app';
import { databaseOptions } from '../../src/shared/infrastructure/database/database-options';
import { seedProducts } from '../../src/shared/infrastructure/database/seed-products';
import {
  PAYMENT_GATEWAY,
  PAYMENT_CHECKOUT,
  PAYMENT_EVENTS,
} from '../../src/payments/domain/payment-ports';
import type {
  PaymentObservation,
  PaymentStatus,
} from '../../src/payments/domain/payment-gateway.port';
import {
  WompiCheckout,
  WompiEvents,
} from '../../src/payments/infrastructure/wompi';
import { settings, eventBody } from '../payment-fixtures';
import { deliveryInput } from '../checkout-fixtures';
const productId = '11111111-1111-4111-8111-111111111111';
const secondId = '22222222-2222-4222-8222-222222222222';
let source: DataSource;
let app: INestApplication;
const gateway = { getPayment: jest.fn() };
const cards = {
  enabled: true,
  configuration: jest.fn(),
  charge: jest.fn(),
};
beforeAll(async () => {
  if (!process.env.POSTGRES_DB?.endsWith('_test'))
    throw new Error('Payment integration requires isolated _test database');
  source = new DataSource(databaseOptions());
  await source.initialize();
  await source.runMigrations();
  await seedProducts(source);
  const module = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(CARD_PAYMENTS)
    .useValue(cards)
    .overrideProvider(PAYMENT_GATEWAY)
    .useValue(gateway)
    .overrideProvider(PAYMENT_CHECKOUT)
    .useValue(new WompiCheckout(settings))
    .overrideProvider(PAYMENT_EVENTS)
    .useValue(new WompiEvents(settings))
    .compile();
  app = module.createNestApplication({ bodyParser: false });
  configureApp(app, { FRONTEND_ORIGIN: 'http://localhost:5173' });
  await app.init();
}, 30000);
beforeEach(async () => {
  gateway.getPayment.mockReset();
  cards.charge.mockReset();
  cards.configuration.mockReset();
  await source.query(
    'TRUNCATE transaction_items,transactions,deliveries,customers',
  );
  await source.query('UPDATE products SET stock_on_hand=20,stock_reserved=0');
});
afterAll(async () => {
  if (app) await app.close();
  if (source?.isInitialized) await source.destroy();
});
async function create(basket = false) {
  const agent = request.agent(app.getHttpServer());
  await agent
    .post('/api/customers')
    .set('X-Checkout-Request', '1')
    .send({
      fullName: 'Ana Prueba',
      email: 'ana@example.com',
      phone: '+573001234567',
    })
    .expect(201);
  const delivery = await agent
    .post('/api/deliveries')
    .set('X-Checkout-Request', '1')
    .send(deliveryInput)
    .expect(201);
  const items = basket
    ? [
        { productId, quantity: 2 },
        { productId: secondId, quantity: 3 },
      ]
    : undefined;
  const input = {
    productId,
    quantity: basket ? 2 : 1,
    deliveryId: delivery.body.id,
    ...(items ? { items } : {}),
  };
  const quote = await agent
    .post('/api/checkout/quote')
    .set('X-Checkout-Request', '1')
    .send(input)
    .expect(200);
  const response = await agent
    .post('/api/transactions')
    .set('X-Checkout-Request', '1')
    .set('Idempotency-Key', 'payment-order-1')
    .send({ ...input, expectedTotalMinor: quote.body.totalMinor })
    .expect(201);
  const id = response.body.id as string;
  const reference = response.body.reference as string;
  const observed: PaymentObservation = {
    id: 'payment-1',
    reference,
    amountMinor: response.body.totalMinor,
    currency: 'COP',
    status: 'APPROVED',
  };
  gateway.getPayment.mockResolvedValue({ ok: true, value: observed });
  return {
    agent,
    id,
    reference,
    observed,
    deliveryId: delivery.body.id as string,
  };
}
async function start(f: Awaited<ReturnType<typeof create>>) {
  return f.agent
    .post(`/api/transactions/${f.id}/payment-session`)
    .set('X-Checkout-Request', '1')
    .send({ method: 'CARD' })
    .expect(200);
}
function verify(
  f: Awaited<ReturnType<typeof create>>,
  body: object = { providerPaymentId: 'payment-1' },
) {
  return f.agent
    .post(`/api/transactions/${f.id}/payment-verification`)
    .set('X-Checkout-Request', '1')
    .send(body);
}
async function inventory() {
  return source.query(
    'SELECT id,stock_on_hand,stock_reserved FROM products WHERE id=ANY($1::uuid[]) ORDER BY id',
    [[productId, secondId]],
  ) as Promise<{ id: string; stock_on_hand: number; stock_reserved: number }[]>;
}
it('dos preparaciones usan firma/expiración estables y conservan PENDING', async () => {
  const f = await create();
  const responses = await Promise.all([start(f), start(f)]);
  expect(responses[0].body).toEqual(responses[1].body);
  expect(JSON.stringify(responses[0].body)).not.toContain(settings.privateKey);
  expect(
    (
      await source.query(
        'SELECT payment_started_at FROM transactions WHERE id=$1',
        [f.id],
      )
    )[0].payment_started_at,
  ).toBeInstanceOf(Date);
  expect(
    (await f.agent.get(`/api/transactions/${f.id}`).expect(200)).body.status,
  ).toBe('PENDING');
});
it('aprobación confirma todas las líneas y entrega una sola vez frente a carrera de verificación/webhook', async () => {
  const f = await create(true);
  await start(f);
  await Promise.all([
    verify(f).expect(200),
    verify(f).expect(200),
    request(app.getHttpServer())
      .post('/api/payments/wompi/events')
      .send(eventBody())
      .expect(200),
  ]);
  expect(await inventory()).toEqual([
    { id: productId, stock_on_hand: 18, stock_reserved: 0 },
    { id: secondId, stock_on_hand: 17, stock_reserved: 0 },
  ]);
  const result = await f.agent.get(`/api/transactions/${f.id}`).expect(200);
  expect(result.body.status).toBe('APPROVED');
  expect(result.body.reservationStatus).toBe('CONFIRMED');
  expect(
    (
      await source.query('SELECT status FROM deliveries WHERE id=$1', [
        f.deliveryId,
      ])
    )[0].status,
  ).toBe('READY');
  await verify(f, {}).expect(200);
  expect((await inventory())[0].stock_on_hand).toBe(18);
  await start(f).catch((e) => expect(e.message).toContain('409'));
});
it.each(['DECLINED', 'ERROR', 'VOIDED'] as PaymentStatus[])(
  'resultado %s libera reserva sin descontar inventario físico',
  async (status) => {
    const f = await create(true);
    await start(f);
    gateway.getPayment.mockResolvedValue({
      ok: true,
      value: { ...f.observed, status },
    });
    await verify(f).expect(200);
    await verify(f).expect(200);
    expect(
      (await inventory()).every(
        (p) => p.stock_on_hand === 20 && p.stock_reserved === 0,
      ),
    ).toBe(true);
    expect(
      (await f.agent.get(`/api/transactions/${f.id}`).expect(200)).body.status,
    ).toBe(status === 'VOIDED' ? 'DECLINED' : status);
  },
);
it('timeout mantiene PENDING/reserva incluso con vencimiento y permite reconciliar después', async () => {
  const f = await create();
  await start(f);
  gateway.getPayment.mockResolvedValueOnce({
    ok: false,
    error: 'PaymentProviderUnavailable',
  });
  await verify(f).expect(503);
  await source.query(
    "UPDATE transactions SET reservation_expires_at=now()-interval '1 minute' WHERE id=$1",
    [f.id],
  );
  expect(
    (await f.agent.get(`/api/transactions/${f.id}`).expect(200)).body.status,
  ).toBe('PENDING');
  expect((await inventory())[0].stock_reserved).toBe(1);
  await verify(f).expect(200);
  expect((await inventory())[0].stock_on_hand).toBe(19);
});
it('firma inválida y campos de tarjeta no llegan al proveedor ni cambian stock', async () => {
  const f = await create();
  await start(f);
  const body = eventBody();
  body.signature.checksum = '0'.repeat(64);
  await request(app.getHttpServer())
    .post('/api/payments/wompi/events')
    .send(body)
    .expect(401);
  await verify(f, {
    providerPaymentId: 'payment-1',
    status: 'APPROVED',
    cardNumber: 'not-a-card',
  }).expect(400);
  expect(gateway.getPayment).not.toHaveBeenCalled();
  expect((await inventory())[0].stock_reserved).toBe(1);
});
it.each([
  { amountMinor: '1' },
  { currency: 'USD' },
  { reference: 'another-order' },
])(
  'importe/moneda/referencia alterados no afectan inventario: %p',
  async (changes) => {
    const f = await create();
    await start(f);
    gateway.getPayment.mockResolvedValue({
      ok: true,
      value: { ...f.observed, ...changes },
    });
    await verify(f).expect(409);
    expect((await inventory())[0].stock_reserved).toBe(1);
  },
);
it('sesión ajena no puede preparar/verificar y evento auténtico puede finalizar sin cookie', async () => {
  const owner = await create();
  const other = await create();
  await other.agent
    .post(`/api/transactions/${owner.id}/payment-session`)
    .set('X-Checkout-Request', '1')
    .send({})
    .expect(404);
  await other.agent
    .post(`/api/transactions/${owner.id}/payment-verification`)
    .set('X-Checkout-Request', '1')
    .send({})
    .expect(404);
  await start(owner);
  gateway.getPayment.mockResolvedValue({ ok: true, value: owner.observed });
  await request(app.getHttpServer())
    .post('/api/payments/wompi/events')
    .send(eventBody())
    .expect(200);
  expect(
    (await owner.agent.get(`/api/transactions/${owner.id}`).expect(200)).body
      .status,
  ).toBe('APPROVED');
});
it('fallar la entrega revierte también pago y stock; el reintento puede completar', async () => {
  const f = await create(true);
  await start(f);
  await source.query(
    "CREATE FUNCTION reject_payment_delivery() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test delivery failure'; END $$",
  );
  await source.query(
    'CREATE TRIGGER reject_payment_delivery BEFORE UPDATE ON deliveries FOR EACH ROW EXECUTE FUNCTION reject_payment_delivery()',
  );
  try {
    await verify(f).expect(503);
    expect((await inventory())[0]).toMatchObject({
      stock_on_hand: 20,
      stock_reserved: 2,
    });
    expect(
      (await f.agent.get(`/api/transactions/${f.id}`).expect(200)).body.status,
    ).toBe('PENDING');
  } finally {
    await source.query('DROP TRIGGER reject_payment_delivery ON deliveries');
    await source.query('DROP FUNCTION reject_payment_delivery()');
  }
  await verify(f).expect(200);
  expect((await inventory())[0].stock_on_hand).toBe(18);
});
it('protege trazabilidad al intentar revertir una migración con pago iniciado', async () => {
  const f = await create();
  await start(f);
  await source.undoLastMigration();
  await expect(source.undoLastMigration()).rejects.toThrow(
    'Cannot remove payment tracking',
  );
  await source.runMigrations();
});

const cardAuthorization = {
  token: 'tok_stagtest_integration',
  acceptanceToken: 'privacy-token',
  personalDataToken: 'personal-token',
  installments: 1,
  privacyAccepted: true,
  personalDataAccepted: true,
};
function payCard(
  f: Awaited<ReturnType<typeof create>>,
  body: object = cardAuthorization,
) {
  return f.agent
    .post(`/api/transactions/${f.id}/payments`)
    .set('X-Checkout-Request', '1')
    .send(body);
}
it('cargo directo: ocho solicitudes generan un solo POST al proveedor y un descuento', async () => {
  const f = await create(true);
  cards.charge.mockResolvedValue({ ok: true, value: f.observed });
  await Promise.all(Array.from({ length: 8 }, () => payCard(f).expect(200)));
  expect(cards.charge).toHaveBeenCalledTimes(1);
  expect((await inventory())[0]).toMatchObject({
    stock_on_hand: 18,
    stock_reserved: 0,
  });
  const row = (
    await source.query(
      'SELECT payment_submitted_at,status FROM transactions WHERE id=$1',
      [f.id],
    )
  )[0];
  expect(row.payment_submitted_at).toBeInstanceOf(Date);
  expect(row.status).toBe('APPROVED');
  await expect(source.undoLastMigration()).rejects.toThrow(
    'Cannot remove card payment tracking',
  );
});
it('timeout de creación conserva claim; reintentar no envía otro cargo y webhook reconcilia', async () => {
  const f = await create();
  cards.charge.mockResolvedValueOnce({
    ok: false,
    error: 'PaymentProviderUnavailable',
  });
  await payCard(f).expect(503);
  await payCard(f).expect(200);
  expect(cards.charge).toHaveBeenCalledTimes(1);
  const state = await f.agent
    .post(`/api/transactions/${f.id}/payment-verification`)
    .set('X-Checkout-Request', '1')
    .send({})
    .expect(200);
  expect(state.body.submitted).toBe(true);
  expect((await inventory())[0].stock_reserved).toBe(1);
  await request(app.getHttpServer())
    .post('/api/payments/wompi/events')
    .send(eventBody())
    .expect(200);
  expect((await inventory())[0].stock_on_hand).toBe(19);
});
it('tarjeta en claro, consentimientos falsos y sesión ajena se rechazan sin claim', async () => {
  const owner = await create();
  const other = await create();
  await payCard(owner, { ...cardAuthorization, number: 'NOT_A_CARD' }).expect(
    400,
  );
  await payCard(owner, { ...cardAuthorization, privacyAccepted: false }).expect(
    400,
  );
  await other.agent
    .post(`/api/transactions/${owner.id}/payments`)
    .set('X-Checkout-Request', '1')
    .send(cardAuthorization)
    .expect(404);
  expect(cards.charge).not.toHaveBeenCalled();
  expect(
    (
      await source.query(
        'SELECT payment_submitted_at FROM transactions WHERE id=$1',
        [owner.id],
      )
    )[0].payment_submitted_at,
  ).toBeNull();
});
