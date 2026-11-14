import { Logger, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import {
  CheckoutRuntimeModule,
  NodeCheckoutRuntime,
} from '../src/shared/infrastructure/checkout-runtime';
import { CustomersModule } from '../src/customers/infrastructure/customers.module';
import { DeliveriesModule } from '../src/deliveries/infrastructure/deliveries.module';
import { TransactionsModule } from '../src/transactions/infrastructure/transactions.module';
import { CUSTOMER_REPOSITORY } from '../src/customers/domain/customer-repository.port';
import { DELIVERY_REPOSITORY } from '../src/deliveries/domain/delivery-repository.port';
import {
  CHECKOUT_UNIT_OF_WORK,
  type StoredTransaction,
} from '../src/transactions/domain/checkout-unit-of-work.port';
import { CustomersController } from '../src/customers/infrastructure/customers.controller';
import { RegisterCustomer } from '../src/customers/application/register-customer';
import { configureApp } from '../src/bootstrap/configure-app';
import { checkoutValue } from '../src/shared/infrastructure/checkout-http';
import {
  deliveryInput,
  deliveryId,
  pendingInput,
  quoteInput,
  storeFixture,
} from './checkout-fixtures';
let app: INestApplication;
const sessions = new Map<string, { customerId: string; expiresAt: Date }>();
const owners = new Map<string, string>();
const transactions = new Map<string, StoredTransaction>();
let store = storeFixture();
const insertCustomer = jest.fn(
  async (customer: { id: string }, hash: string, expiresAt: Date) => {
    sessions.set(hash, { customerId: customer.id, expiresAt });
    return { ok: true as const, value: undefined };
  },
);
const findSession = jest.fn(async (hash: string) => ({
  ok: true as const,
  value: sessions.get(hash) || null,
}));
const insertDelivery = jest.fn(
  async (delivery: { id: string; customerId: string }) => {
    owners.set(delivery.id, delivery.customerId);
    return { ok: true as const, value: undefined };
  },
);
beforeAll(async () => {
  const module = await Test.createTestingModule({
    imports: [
      CheckoutRuntimeModule,
      CustomersModule,
      DeliveriesModule,
      TransactionsModule,
    ],
  })
    .overrideProvider(CUSTOMER_REPOSITORY)
    .useValue({ insert: insertCustomer, findSession })
    .overrideProvider(DELIVERY_REPOSITORY)
    .useValue({ insert: insertDelivery })
    .overrideProvider(CHECKOUT_UNIT_OF_WORK)
    .useValue({
      run: (
        work: (store: ReturnType<typeof storeFixture>) => Promise<unknown>,
      ) => work(store),
    })
    .compile();
  app = module.createNestApplication({ bodyParser: false });
  configureApp(app, { FRONTEND_ORIGIN: 'http://localhost:5173' });
  await app.init();
});
afterAll(() => app.close());
beforeEach(() => {
  sessions.clear();
  owners.clear();
  transactions.clear();
  store = storeFixture();
  store.lockDelivery.mockImplementation(
    async (id, customerId) => owners.get(id) === customerId,
  );
  store.findOwned.mockImplementation(async (id, customerId) => {
    const row = transactions.get(id);
    return row?.customerId === customerId ? row : null;
  });
  store.findByKey.mockImplementation(
    async (customerId, key) =>
      [...transactions.values()].find(
        (row) => row.customerId === customerId && row.idempotencyKey === key,
      ) || null,
  );
  store.insert.mockImplementation(async (row) => {
    transactions.set(row.id, row);
  });
  insertCustomer.mockClear();
  findSession.mockClear();
  insertDelivery.mockClear();
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
  return { agent, response };
}
async function prepared() {
  const result = await session();
  const response = await result.agent
    .post('/api/deliveries')
    .set('X-Checkout-Request', '1')
    .send(deliveryInput)
    .expect(201);
  return { ...result, deliveryId: response.body.id as string };
}
it('crea sesión HttpOnly sin devolver credencial ni contacto en JSON', async () => {
  const { response } = await session();
  expect(Object.keys(response.body)).toEqual(['id']);
  const cookie = String(response.headers['set-cookie']);
  expect(cookie.includes('HttpOnly')).toBe(true);
  expect(cookie.includes('Path=/api')).toBe(true);
  expect(cookie.includes('SameSite=Lax')).toBe(true);
  const hash = [...sessions.keys()][0];
  expect(hash).toHaveLength(64);
  expect(cookie.includes(hash)).toBe(false);
  expect(response.headers['cache-control']).toBe('no-store');
  await request(app.getHttpServer())
    .get(`/api/transactions/${deliveryId}`)
    .set('Cookie', `checkout_session=${hash}`)
    .expect(401);
});
it('rechaza campos de tarjeta sin reflejarlos ni persistirlos', async () => {
  for (const field of ['cardNumber', 'pan', 'cvv', 'cvc']) {
    const response = await request(app.getHttpServer())
      .post('/api/customers')
      .set('X-Checkout-Request', '1')
      .send({
        fullName: 'Ana',
        email: 'ana@example.com',
        phone: '+573001234567',
        [field]: 'PRIVATE_CARD_MARKER',
      })
      .expect(400);
    expect(response.text).not.toContain('PRIVATE_CARD_MARKER');
    expect(response.body.code).toBe('InvalidInput');
  }
  expect(insertCustomer).not.toHaveBeenCalled();
});
it('exige cabecera anti-CSRF y sesión para datos del checkout', async () => {
  await request(app.getHttpServer())
    .post('/api/customers')
    .send({})
    .expect(403);
  await request(app.getHttpServer())
    .post('/api/deliveries')
    .set('X-Checkout-Request', '1')
    .send(deliveryInput)
    .expect(401);
  await request(app.getHttpServer())
    .get(`/api/transactions/${deliveryId}`)
    .expect(401);
  await request(app.getHttpServer())
    .get(`/api/transactions/${deliveryId}`)
    .set('Cookie', 'checkout_session=invalid')
    .expect(401);
});
it('permite CORS con cookie solo para el origen configurado', async () => {
  const response = await request(app.getHttpServer())
    .options('/api/customers')
    .set('Origin', 'http://localhost:5173')
    .set('Access-Control-Request-Method', 'POST')
    .set('Access-Control-Request-Headers', 'X-Checkout-Request,Content-Type')
    .expect(204);
  expect(response.headers['access-control-allow-origin']).toBe(
    'http://localhost:5173',
  );
  expect(response.headers['access-control-allow-credentials']).toBe('true');
  const other = await request(app.getHttpServer())
    .options('/api/customers')
    .set('Origin', 'https://attacker.example')
    .set('Access-Control-Request-Method', 'POST')
    .expect(204);
  expect(other.headers['access-control-allow-origin']).not.toBe(
    'https://attacker.example',
  );
});
it('cotiza, crea PENDING y permite reanudar sin datos personales', async () => {
  const { agent, deliveryId } = await prepared();
  const quote = await agent
    .post('/api/checkout/quote')
    .set('X-Checkout-Request', '1')
    .send({ ...quoteInput, deliveryId })
    .expect(200);
  expect(quote.body.totalMinor).toBe('10490000');
  expect(store.reserve).not.toHaveBeenCalled();
  const created = await agent
    .post('/api/transactions')
    .set('X-Checkout-Request', '1')
    .set('Idempotency-Key', 'request-0001')
    .send({ ...pendingInput, deliveryId })
    .expect(201);
  expect(created.body.status).toBe('PENDING');
  expect(store.reserve).toHaveBeenCalledTimes(1);
  const repeated = await agent
    .post('/api/transactions')
    .set('X-Checkout-Request', '1')
    .set('Idempotency-Key', 'request-0001')
    .send({ ...pendingInput, deliveryId })
    .expect(201);
  expect(repeated.body.id).toBe(created.body.id);
  expect(store.reserve).toHaveBeenCalledTimes(1);
  const resumed = await agent
    .get(`/api/transactions/${created.body.id}`)
    .expect(200);
  expect(resumed.body.id).toBe(created.body.id);
  expect(resumed.text).not.toContain('ana@example.com');
  expect(resumed.body).not.toHaveProperty('requestHash');
  const other = await session();
  await other.agent.get(`/api/transactions/${created.body.id}`).expect(404);
  await other.agent
    .post('/api/checkout/quote')
    .set('X-Checkout-Request', '1')
    .send({ ...quoteInput, deliveryId })
    .expect(404);
});
it('no acepta total alterado, clave ausente ni tarjeta en la transacción', async () => {
  const { agent, deliveryId } = await prepared();
  await agent
    .post('/api/transactions')
    .set('X-Checkout-Request', '1')
    .send({ ...pendingInput, deliveryId })
    .expect(400);
  await agent
    .post('/api/transactions')
    .set('X-Checkout-Request', '1')
    .set('Idempotency-Key', 'request-0001')
    .send({ ...pendingInput, deliveryId, expectedTotalMinor: '1' })
    .expect(409);
  const card = await agent
    .post('/api/transactions')
    .set('X-Checkout-Request', '1')
    .set('Idempotency-Key', 'request-0001')
    .send({ ...pendingInput, deliveryId, cvv: 'PRIVATE_CVV_MARKER' })
    .expect(400);
  expect(card.text).not.toContain('PRIVATE_CVV_MARKER');
  expect(store.reserve).not.toHaveBeenCalled();
  await agent
    .post('/api/transactions')
    .set('X-Checkout-Request', '1')
    .set('Idempotency-Key', 'request-0001')
    .send({ ...pendingInput, deliveryId })
    .expect(201);
  await agent
    .post('/api/transactions')
    .set('X-Checkout-Request', '1')
    .set('Idempotency-Key', 'request-0001')
    .send({ ...pendingInput, deliveryId, quantity: 2 })
    .expect(409);
});
it('rechaza entradas inválidas, UUID incorrecto y cookie vencida', async () => {
  await request(app.getHttpServer())
    .post('/api/customers')
    .set('X-Checkout-Request', '1')
    .send({ fullName: 'Ana', email: 'bad', phone: 'bad' })
    .expect(400);
  const { agent } = await session();
  await agent
    .post('/api/deliveries')
    .set('X-Checkout-Request', '1')
    .send({ ...deliveryInput, city: '' })
    .expect(400);
  await agent
    .post('/api/deliveries')
    .set('X-Checkout-Request', '1')
    .send({ ...deliveryInput, recipientPhone: 'invalid' })
    .expect(400);
  await agent
    .post('/api/checkout/quote')
    .set('X-Checkout-Request', '1')
    .send({ ...quoteInput, quantity: '1' })
    .expect(400);
  await agent.get('/api/transactions/wrong').expect(400);
  for (const entry of sessions.values()) entry.expiresAt = new Date(0);
  await agent.get(`/api/transactions/${deliveryId}`).expect(401);
});
it('traduce fallos de almacenamiento y errores inesperados sin filtrar contenido', async () => {
  insertCustomer.mockResolvedValueOnce({
    ok: false,
    error: 'CheckoutStorageUnavailable',
  } as never);
  await request(app.getHttpServer())
    .post('/api/customers')
    .set('X-Checkout-Request', '1')
    .send({ fullName: 'Ana', email: 'ana@example.com', phone: '+573001234567' })
    .expect(503);
  const { agent } = await prepared();
  findSession.mockResolvedValueOnce({
    ok: false,
    error: 'CheckoutStorageUnavailable',
  } as never);
  await agent.get(`/api/transactions/${deliveryId}`).expect(503);
  const logger = jest
    .spyOn(Logger.prototype, 'error')
    .mockImplementation(() => undefined);
  try {
    store.lockProduct.mockRejectedValueOnce(
      new Error('PRIVATE_PROVIDER_MARKER'),
    );
    const response = await agent
      .post('/api/checkout/quote')
      .set('X-Checkout-Request', '1')
      .send({ ...quoteInput, deliveryId: [...owners.keys()][0] })
      .expect(500);
    expect(response.text).not.toContain('PRIVATE_PROVIDER_MARKER');
    expect(JSON.stringify(logger.mock.calls)).not.toContain(
      'PRIVATE_PROVIDER_MARKER',
    );
    expect(logger).toHaveBeenCalledWith('HTTP request failed unexpectedly');
  } finally {
    logger.mockRestore();
  }
});
it('documenta cookie, cuerpos y claves de idempotencia en OpenAPI', async () => {
  const response = await request(app.getHttpServer())
    .get('/docs-json')
    .expect(200);
  expect(response.body.components.securitySchemes.checkout.in).toBe('cookie');
  expect(
    response.body.paths['/api/transactions'].post.parameters.map(
      (value: { name: string }) => value.name,
    ),
  ).toContain('Idempotency-Key');
  expect(
    response.body.components.schemas.PendingDto.properties,
  ).not.toHaveProperty('cardNumber');
});
it('cookie de producción es Secure, HttpOnly y SameSite=None', async () => {
  const previous = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  try {
    const cookie = jest.fn();
    const controller = new CustomersController({
      execute: jest.fn().mockResolvedValue({
        ok: true,
        value: { id: 'id', sessionToken: new NodeCheckoutRuntime().token() },
      }),
    } as unknown as RegisterCustomer);
    await controller.create(
      { fullName: 'Ana', email: 'ana@example.com', phone: '+573001234567' },
      { cookie } as never,
    );
    expect(cookie.mock.calls[0][2]).toMatchObject({
      secure: true,
      httpOnly: true,
      sameSite: 'none',
    });
  } finally {
    process.env.NODE_ENV = previous;
  }
});
it('mapea un fallo ROP sin exponer contexto privado', () => {
  expect(() =>
    checkoutValue({ ok: false, error: 'AmountOutOfRange' }),
  ).toThrow();
});

it('JSON malformado y cuerpos demasiado grandes no reflejan datos recibidos', async () => {
  const malformed = await request(app.getHttpServer())
    .post('/api/customers')
    .set('X-Checkout-Request', '1')
    .set('Content-Type', 'application/json')
    .send('{"cvv":"PRIVATE_JSON_MARKER",')
    .expect(400);
  expect(malformed.text).not.toContain('PRIVATE_JSON_MARKER');
  const oversized = await request(app.getHttpServer())
    .post('/api/customers')
    .set('X-Checkout-Request', '1')
    .send({ cardNumber: 'PRIVATE_LARGE_MARKER', extra: 'x'.repeat(18000) })
    .expect(413);
  expect(oversized.text).not.toContain('PRIVATE_LARGE_MARKER');
  expect(insertCustomer).not.toHaveBeenCalled();
});
it('normaliza email desde la frontera HTTP antes de validar', async () => {
  await request(app.getHttpServer())
    .post('/api/customers')
    .set('X-Checkout-Request', '1')
    .send({
      fullName: 'Ana',
      email: ' ANA@EXAMPLE.COM ',
      phone: '+573001234567',
    })
    .expect(201);
  expect(insertCustomer.mock.calls[0][0]).toMatchObject({
    email: 'ana@example.com',
  });
});
