import { Logger, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { configureApp } from '../src/bootstrap/configure-app';
import { ProcessPaymentEvent } from '../src/payments/application/verify-payment';
import type {
  PaymentRecord,
  PaymentStore,
  PaymentUnitOfWork,
} from '../src/payments/domain/payment-ports';
import { WompiEventsController } from '../src/payments/infrastructure/payments.controller';
import { WompiEvents } from '../src/payments/infrastructure/wompi';
import { data, eventBody, settings } from './payment-fixtures';

const record: PaymentRecord = {
  id: 'order',
  customerId: 'customer',
  deliveryId: 'delivery',
  reference: data.reference,
  totalMinor: String(data.amount_in_cents),
  currency: 'COP',
  status: 'PENDING',
  reservationStatus: 'ACTIVE',
  providerPaymentId: null,
  reservationExpiresAt: '2026-11-14T12:00:00Z',
  paymentStartedAt: '2026-11-14T11:00:00Z',
  paymentSubmittedAt: null,
  paymentExpiresAt: null,
  customerEmail: 'PRIVATE_CONTACT_MARKER',
};
let app: INestApplication;
let current: PaymentRecord;
const gateway = { getPayment: jest.fn() };
const apply = jest.fn();
const store: PaymentStore = {
  find: jest.fn(),
  findByReference: jest.fn(async () => current),
  start: jest.fn(),
  claimSubmission: jest.fn(),
  apply,
};
const unit: PaymentUnitOfWork = { run: jest.fn(async (work) => work(store)) };
let log: jest.SpyInstance;
let warn: jest.SpyInstance;
let error: jest.SpyInstance;
beforeAll(async () => {
  const module = await Test.createTestingModule({
    controllers: [WompiEventsController],
    providers: [
      {
        provide: ProcessPaymentEvent,
        useValue: new ProcessPaymentEvent(
          new WompiEvents(settings),
          gateway,
          unit,
        ),
      },
    ],
  }).compile();
  app = module.createNestApplication({ bodyParser: false });
  configureApp(app, { FRONTEND_ORIGIN: 'http://localhost:5173' });
  await app.init();
});
afterAll(() => app.close());
beforeEach(() => {
  current = { ...record };
  gateway.getPayment.mockReset().mockResolvedValue({
    ok: true,
    value: {
      id: data.id,
      reference: data.reference,
      amountMinor: String(data.amount_in_cents),
      currency: 'COP',
      status: 'APPROVED',
    },
  });
  apply
    .mockReset()
    .mockImplementation(async (_order, observation, decision) => {
      current.status = observation.status;
      current.reservationStatus =
        decision.kind === 'confirm'
          ? 'CONFIRMED'
          : decision.kind === 'pending'
            ? 'ACTIVE'
            : 'RELEASED';
      current.providerPaymentId = observation.id;
    });
  jest.mocked(unit.run).mockClear();
  log = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
  warn = jest
    .spyOn(Logger.prototype, 'warn')
    .mockImplementation(() => undefined);
  error = jest
    .spyOn(Logger.prototype, 'error')
    .mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());
const send = (body: unknown = eventBody()) =>
  request(app.getHttpServer())
    .post('/api/payments/wompi/events')
    .send(body as object);

it.each([
  ['APPROVED', 'confirmed', 'CONFIRMED'],
  ['DECLINED', 'released', 'RELEASED'],
])(
  'aplica %s verificado y reconoce el reintento sin repetir escrituras',
  async (status, outcome, reservation) => {
    gateway.getPayment.mockResolvedValue({
      ok: true,
      value: {
        id: data.id,
        reference: data.reference,
        amountMinor: String(data.amount_in_cents),
        currency: 'COP',
        status,
      },
    });
    // El cuerpo firmado dice APPROVED: el estado aplicado es el obtenido por la API privada.
    expect((await send().expect(200)).body).toEqual({ received: true });
    expect(current).toMatchObject({ status, reservationStatus: reservation });
    await send().expect(200);
    expect(apply).toHaveBeenCalledTimes(1);
    const entries = log.mock.calls.map(([entry]) => JSON.parse(entry));
    expect(
      entries
        .filter((entry) => entry.event === 'wompi.webhook.processed')
        .map((entry) => entry.outcome),
    ).toEqual([outcome, 'duplicate']);
    expect(entries[0].correlationId).toMatch(/^[a-f0-9-]{36}$/);
    expect(entries[1].correlationId).toBe(entries[0].correlationId);
    expect(entries[1].durationMs).toBeGreaterThanOrEqual(0);
  },
);

it('rechaza checksum incorrecto sin consultar proveedor ni almacenamiento', async () => {
  const body = eventBody();
  body.signature.checksum = '0'.repeat(64);
  await send(body).expect(401);
  expect(gateway.getPayment).not.toHaveBeenCalled();
  expect(unit.run).not.toHaveBeenCalled();
  expect(JSON.parse(warn.mock.calls[0][0])).toMatchObject({
    event: 'wompi.webhook.rejected',
    code: 'InvalidWebhook',
  });
});

it('rechaza un evento firmado con otro secreto y un ambiente prod', async () => {
  const { createHash } = await import('node:crypto');
  const body = eventBody();
  body.signature.checksum = createHash('sha256')
    .update(
      `${data.status}${data.amount_in_cents}${data.id}${body.timestamp}wrong-secret`,
    )
    .digest('hex');
  await send(body).expect(401);
  await send({ ...eventBody(), environment: 'prod' }).expect(401);
  expect(gateway.getPayment).not.toHaveBeenCalled();
});

it('un fallo de persistencia devuelve 503 sin anunciar confirmacion; el reintento puede completar', async () => {
  jest
    .mocked(unit.run)
    .mockResolvedValueOnce({ ok: false, error: 'CheckoutStorageUnavailable' });
  await send().expect(503);
  expect(current.status).toBe('PENDING');
  expect(
    log.mock.calls.map(([entry]) => JSON.parse(entry).event),
  ).not.toContain('wompi.webhook.processed');
  expect(JSON.parse(warn.mock.calls[0][0]).code).toBe(
    'CheckoutStorageUnavailable',
  );
  await send().expect(200);
  expect(current.status).toBe('APPROVED');
});

it('errores inesperados y payloads nunca se reflejan en logs ni respuesta', async () => {
  gateway.getPayment.mockRejectedValueOnce(
    new Error('PRIVATE_EXCEPTION_MARKER'),
  );
  const response = await send({
    ...eventBody(),
    extra: 'PRIVATE_PAYLOAD_MARKER',
  }).expect(503);
  expect(JSON.parse(error.mock.calls[0][0])).toMatchObject({
    event: 'wompi.webhook.failed',
    code: 'UnexpectedFailure',
  });
  const output = JSON.stringify([
    log.mock.calls,
    warn.mock.calls,
    error.mock.calls,
    response.body,
  ]);
  for (const marker of [
    'PRIVATE_EXCEPTION_MARKER',
    'PRIVATE_PAYLOAD_MARKER',
    record.customerEmail,
    settings.privateKey,
    settings.eventsSecret,
    eventBody().signature.checksum,
  ])
    expect(output).not.toContain(marker);
});

it('no registra el identificador enviado ni siquiera si tiene formato valido', async () => {
  const secretLikeId = 'PRIVATE_IDENTIFIER_MARKER';
  gateway.getPayment.mockResolvedValueOnce({
    ok: false,
    error: 'PaymentNotFound',
  });
  await send(eventBody(secretLikeId)).expect(404);
  expect(JSON.stringify([log.mock.calls, warn.mock.calls])).not.toContain(
    secretLikeId,
  );
});

it('un resultado PENDING no se anuncia como confirmacion', async () => {
  gateway.getPayment.mockResolvedValueOnce({
    ok: true,
    value: {
      id: data.id,
      reference: data.reference,
      amountMinor: String(data.amount_in_cents),
      currency: 'COP',
      status: 'PENDING',
    },
  });
  await send().expect(200);
  expect(current.status).toBe('PENDING');
  expect(current.reservationStatus).toBe('ACTIVE');
  expect(JSON.parse(log.mock.calls[1][0]).outcome).toBe('pending');
});

it('un pago ajeno a esta aplicacion se ignora sin escribir', async () => {
  jest.mocked(store.findByReference).mockResolvedValueOnce(null);
  await send().expect(200);
  expect(apply).not.toHaveBeenCalled();
  expect(JSON.parse(log.mock.calls[1][0]).outcome).toBe('ignored');
});
