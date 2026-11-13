import 'reflect-metadata';
import 'dotenv/config';
import { DataSource } from 'typeorm';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { Logger } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../../src/bootstrap/app.module';
import { configureApp } from '../../src/bootstrap/configure-app';
import { databaseOptions } from '../../src/shared/infrastructure/database/database-options';
import { seedProducts } from '../../src/shared/infrastructure/database/seed-products';
import { deliveryInput } from '../checkout-fixtures';
const productId = '11111111-1111-4111-8111-111111111111';
let source: DataSource;
let app: INestApplication;
beforeAll(async () => {
  if (!process.env.POSTGRES_DB?.endsWith('_test'))
    throw new Error('Checkout integration requires disposable _test database');
  source = new DataSource(databaseOptions());
  await source.initialize();
  await source.runMigrations();
  await seedProducts(source);
  const module = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();
  app = module.createNestApplication({ bodyParser: false });
  configureApp(app, { FRONTEND_ORIGIN: 'http://localhost:5173' });
  await app.init();
}, 30000);
beforeEach(async () => {
  await source.query('TRUNCATE transactions, deliveries, customers');
  await source.query(
    'UPDATE products SET stock_on_hand=20, stock_reserved=0, price_minor=8990000 WHERE id=$1',
    [productId],
  );
});
afterAll(async () => {
  if (app) await app.close();
  if (source?.isInitialized) await source.destroy();
});
async function session() {
  const agent = request.agent(app.getHttpServer());
  const response = await agent
    .post('/api/customers')
    .set('X-Checkout-Request', '1')
    .send({
      fullName: 'Ana Prueba',
      email: 'ana@example.com',
      phone: '+573001234567',
    })
    .expect(201);
  return { agent, customerId: response.body.id as string, response };
}
async function delivery(agent: ReturnType<typeof request.agent>) {
  const response = await agent
    .post('/api/deliveries')
    .set('X-Checkout-Request', '1')
    .send(deliveryInput)
    .expect(201);
  return response.body.id as string;
}
function pending(
  agent: ReturnType<typeof request.agent>,
  deliveryId: string,
  key: string,
  quantity = 1,
  expectedTotalMinor = '10490000',
) {
  return agent
    .post('/api/transactions')
    .set('X-Checkout-Request', '1')
    .set('Idempotency-Key', key)
    .send({ productId, deliveryId, quantity, expectedTotalMinor });
}
async function stock() {
  const rows = await source.query(
    'SELECT stock_on_hand,stock_reserved FROM products WHERE id=$1',
    [productId],
  );
  return rows[0];
}
it('crea una transacción pendiente y conserva stock físico; cookie solo guarda hash en DB', async () => {
  const { agent, customerId, response } = await session();
  const deliveryId = await delivery(agent);
  const quote = await agent
    .post('/api/checkout/quote')
    .set('X-Checkout-Request', '1')
    .send({ productId, deliveryId, quantity: 1 })
    .expect(200);
  expect(quote.body.totalMinor).toBe('10490000');
  expect((await stock()).stock_reserved).toBe(0);
  const created = await pending(agent, deliveryId, 'request-0001').expect(201);
  expect(created.body.status).toBe('PENDING');
  expect(await stock()).toMatchObject({ stock_on_hand: 20, stock_reserved: 1 });
  const resumed = await agent
    .get(`/api/transactions/${created.body.id}`)
    .expect(200);
  expect(resumed.body.id).toBe(created.body.id);
  expect(resumed.body).not.toHaveProperty('customerId');
  expect(resumed.text).not.toContain('ana@example.com');
  const rows = await source.query(
    'SELECT session_hash FROM customers WHERE id=$1',
    [customerId],
  );
  expect(
    String(response.headers['set-cookie']).includes(rows[0].session_hash),
  ).toBe(false);
});
it('reintentos concurrentes con la misma clave crean una sola reserva', async () => {
  const { agent } = await session();
  const deliveryId = await delivery(agent);
  const responses = await Promise.all(
    Array.from({ length: 8 }, () =>
      pending(agent, deliveryId, 'duplicate-0001'),
    ),
  );
  expect(responses.map((response) => response.status)).toEqual(
    Array(8).fill(201),
  );
  expect(new Set(responses.map((response) => response.body.id)).size).toBe(1);
  expect(
    (await source.query('SELECT count(*)::int AS count FROM transactions'))[0]
      .count,
  ).toBe(1);
  expect((await stock()).stock_reserved).toBe(1);
  await pending(agent, deliveryId, 'duplicate-0001', 2, '19480000').expect(409);
});
it('ocho compradores compiten por tres unidades sin sobreventa', async () => {
  await source.query('UPDATE products SET stock_on_hand=3 WHERE id=$1', [
    productId,
  ]);
  const buyers = await Promise.all(Array.from({ length: 8 }, () => session()));
  const deliveries = await Promise.all(
    buyers.map((buyer) => delivery(buyer.agent)),
  );
  const responses = await Promise.all(
    buyers.map((buyer, index) =>
      pending(buyer.agent, deliveries[index], `race-request-${index}`),
    ),
  );
  expect(responses.filter((response) => response.status === 201)).toHaveLength(
    3,
  );
  expect(responses.filter((response) => response.status === 409)).toHaveLength(
    5,
  );
  expect(await stock()).toMatchObject({ stock_on_hand: 3, stock_reserved: 3 });
  expect(
    (await source.query('SELECT count(*)::int AS count FROM transactions'))[0]
      .count,
  ).toBe(3);
});
it('una misma entrega no se asigna a dos transacciones', async () => {
  const { agent } = await session();
  const id = await delivery(agent);
  const responses = await Promise.all([
    pending(agent, id, 'delivery-key-0001'),
    pending(agent, id, 'delivery-key-0002'),
  ]);
  expect(responses.map((response) => response.status).sort()).toEqual([
    201, 409,
  ]);
  expect((await stock()).stock_reserved).toBe(1);
});
it('no acepta un total alterado ni una entrega de otra sesión', async () => {
  const first = await session();
  const id = await delivery(first.agent);
  const second = await session();
  await pending(second.agent, id, 'other-owner-0001').expect(404);
  await pending(first.agent, id, 'wrong-total-0001', 1, '1').expect(409);
  expect((await stock()).stock_reserved).toBe(0);
  const created = await pending(first.agent, id, 'correct-total-0001').expect(
    201,
  );
  await second.agent.get(`/api/transactions/${created.body.id}`).expect(404);
  await pending(first.agent, id, 'malicious-0001')
    .send({ status: 'APPROVED', cardNumber: 'PRIVATE_CARD_MARKER' })
    .expect(400);
});
it('si falla la inserción se revierte también la reserva', async () => {
  const { agent } = await session();
  const id = await delivery(agent);
  const logger = jest
    .spyOn(Logger.prototype, 'error')
    .mockImplementation(() => undefined);
  await source.query(
    'ALTER TABLE transactions ADD CONSTRAINT simulated_failure CHECK(false) NOT VALID',
  );
  try {
    await pending(agent, id, 'rollback-key-0001').expect(503);
    expect((await stock()).stock_reserved).toBe(0);
    expect(
      (await source.query('SELECT count(*)::int AS count FROM transactions'))[0]
        .count,
    ).toBe(0);
  } finally {
    await source.query(
      'ALTER TABLE transactions DROP CONSTRAINT simulated_failure',
    );
    logger.mockRestore();
  }
});
it('vence y libera una reserva sin pago una sola vez', async () => {
  const { agent } = await session();
  const id = await delivery(agent);
  const created = await pending(agent, id, 'expiry-key-0001').expect(201);
  await source.query(
    "UPDATE transactions SET reservation_expires_at=now()-interval '1 second' WHERE id=$1",
    [created.body.id],
  );
  const result = await agent
    .get(`/api/transactions/${created.body.id}`)
    .expect(200);
  expect(result.body.status).toBe('EXPIRED');
  expect(result.body.reservationStatus).toBe('RELEASED');
  await agent.get(`/api/transactions/${created.body.id}`).expect(200);
  expect(await stock()).toMatchObject({ stock_on_hand: 20, stock_reserved: 0 });
});
it('un pago iniciado impide liberar stock por vencimiento solamente', async () => {
  const { agent } = await session();
  const id = await delivery(agent);
  const created = await pending(agent, id, 'started-key-0001').expect(201);
  await source.query(
    "UPDATE transactions SET payment_started_at=now(),reservation_expires_at=now()-interval '1 second' WHERE id=$1",
    [created.body.id],
  );
  const result = await agent
    .get(`/api/transactions/${created.body.id}`)
    .expect(200);
  expect(result.body.status).toBe('PENDING');
  expect((await stock()).stock_reserved).toBe(1);
});
it('la sesión vencida no permite reanudar la transacción', async () => {
  const { agent, customerId } = await session();
  const id = await delivery(agent);
  const created = await pending(agent, id, 'session-key-0001').expect(201);
  await source.query(
    "UPDATE customers SET session_expires_at=now()-interval '1 second' WHERE id=$1",
    [customerId],
  );
  await agent.get(`/api/transactions/${created.body.id}`).expect(401);
});
it('limita ráfagas de consultas en el módulo real', async () => {
  const responses = await Promise.all(
    Array.from({ length: 65 }, () =>
      request(app.getHttpServer()).get('/api/products'),
    ),
  );
  expect(responses.some((response) => response.status === 429)).toBe(true);
});
