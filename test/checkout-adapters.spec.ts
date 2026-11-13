import { Logger } from '@nestjs/common';
import { DataSource, EntityManager, QueryRunner } from 'typeorm';
import { TypeOrmCustomerRepository } from '../src/customers/infrastructure/typeorm-customer.repository';
import { TypeOrmDeliveryRepository } from '../src/deliveries/infrastructure/typeorm-delivery.repository';
import { TypeOrmCheckoutUnitOfWork } from '../src/transactions/infrastructure/typeorm-checkout.unit-of-work';
import { CreateCheckout1794528001000 } from '../src/shared/infrastructure/database/migrations/1794528001000-create-checkout';
import { ProductOrmEntity } from '../src/products/infrastructure/product.orm-entity';
import { NodeCheckoutRuntime } from '../src/shared/infrastructure/checkout-runtime';
import {
  customerId,
  deliveryId,
  stored,
  deliveryInput,
} from './checkout-fixtures';
import { row } from './fixtures';
const unavailable = { ok: false, error: 'CheckoutStorageUnavailable' };
beforeEach(() =>
  jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined),
);
afterEach(() => jest.restoreAllMocks());
it('persiste contacto con hash y traduce fallos sin datos personales', async () => {
  const insert = jest.fn().mockResolvedValue(undefined);
  const query = jest
    .fn()
    .mockResolvedValue([
      { id: customerId, session_expires_at: new Date('2026-11-13') },
    ]);
  const source = {
    getRepository: () => ({ insert }),
    query,
  } as unknown as DataSource;
  const adapter = new TypeOrmCustomerRepository(source);
  const customer = {
    id: customerId,
    fullName: 'Ana',
    email: 'ana@example.com',
    phone: '+573001234567',
  };
  expect(await adapter.insert(customer, 'hash', new Date())).toMatchObject({
    ok: true,
  });
  expect(insert.mock.calls[0][0]).toMatchObject({ sessionHash: 'hash' });
  expect(await adapter.findSession('hash')).toMatchObject({
    ok: true,
    value: { customerId },
  });
  expect(query).toHaveBeenCalledWith(
    expect.stringContaining('session_hash = $1'),
    ['hash'],
  );
  query.mockResolvedValueOnce([]);
  expect(await adapter.findSession('unknown')).toEqual({
    ok: true,
    value: null,
  });
  insert.mockRejectedValueOnce(new Error('private'));
  query.mockRejectedValueOnce(new Error('private'));
  expect(await adapter.insert(customer, 'hash', new Date())).toEqual(
    unavailable,
  );
  expect(await adapter.findSession('hash')).toEqual(unavailable);
  expect(
    JSON.stringify(jest.mocked(Logger.prototype.error).mock.calls),
  ).not.toContain('private');
});
it('persiste dirección explícitamente y controla errores de infraestructura', async () => {
  const insert = jest.fn().mockResolvedValue(undefined);
  const adapter = new TypeOrmDeliveryRepository({
    getRepository: () => ({ insert }),
  } as unknown as DataSource);
  const delivery = { ...deliveryInput, id: deliveryId, customerId };
  expect(await adapter.insert(delivery)).toMatchObject({ ok: true });
  expect(insert.mock.calls[0][0]).toEqual(delivery);
  insert.mockRejectedValueOnce(new Error('private address'));
  expect(await adapter.insert(delivery)).toEqual(unavailable);
});
it('genera identificadores y credenciales impredecibles; hash no reversible por almacenamiento', () => {
  const runtime = new NodeCheckoutRuntime();
  const token = runtime.token();
  expect(runtime.id()).toMatch(/^[a-f0-9-]{36}$/);
  expect(token).toMatch(/^[a-f0-9]{64}$/);
  expect(runtime.token()).not.toBe(token);
  expect(runtime.hash(token)).toHaveLength(64);
  expect(runtime.hash(token)).not.toBe(token);
  expect(runtime.hash(token)).toBe(runtime.hash(token));
  expect(runtime.now()).toBeInstanceOf(Date);
});
function fixture() {
  const getMany = jest.fn().mockResolvedValue([
    {
      ...stored,
      reservationExpiresAt: new Date(stored.reservationExpiresAt),
    },
  ]);
  const getOne = jest.fn().mockResolvedValue(row());
  const builder = {
    where: jest.fn().mockReturnThis(),
    setLock: jest.fn().mockReturnThis(),
    getOne,
    getMany,
  };
  const insert = jest.fn().mockResolvedValue(undefined);
  const query = jest.fn().mockImplementation((sql: string) => {
    if (sql.startsWith('SELECT id FROM'))
      return Promise.resolve([{ id: deliveryId }]);
    if (sql.startsWith('UPDATE products SET stock_reserved'))
      return Promise.resolve([[{ id: row().id }], 1]);
    return Promise.resolve([]);
  });
  const manager = {
    getRepository: (target: unknown) =>
      target === ProductOrmEntity
        ? { createQueryBuilder: () => builder }
        : { createQueryBuilder: () => builder, insert },
    query,
  } as unknown as EntityManager;
  const transaction = jest.fn(
    async (work: (manager: EntityManager) => Promise<unknown>) => work(manager),
  );
  const unit = new TypeOrmCheckoutUnitOfWork({
    transaction,
  } as unknown as DataSource);
  return { unit, query, getOne, getMany, insert, transaction, builder };
}
it('unidad de trabajo mapea datos y usa consultas parametrizadas y bloqueos', async () => {
  const f = fixture();
  const result = await f.unit.run(async (store) => {
    await store.lockRequest(customerId, 'request-0001');
    expect(await store.findByKey(customerId, 'request-0001')).toMatchObject({
      id: stored.id,
      reservationExpiresAt: stored.reservationExpiresAt,
    });
    expect(await store.findOwned(stored.id, customerId)).toMatchObject({
      id: stored.id,
    });
    f.getMany.mockResolvedValueOnce([]);
    expect(await store.findOwned(stored.id, customerId)).toBeNull();
    expect((await store.lockProduct(row().id))?.data.priceMinor).toBe(8990000n);
    f.getOne.mockResolvedValueOnce(null);
    expect(await store.lockProduct(row().id)).toBeNull();
    expect(f.builder.setLock).toHaveBeenCalledWith('pessimistic_write');
    await store.releaseExpiredUnstarted(row().id, new Date());
    expect(f.query).toHaveBeenCalledWith(
      expect.stringContaining('payment_started_at IS NULL'),
      expect.any(Array),
    );
    expect(await store.lockDelivery(deliveryId, customerId)).toBe(true);
    expect(await store.deliveryUsed(deliveryId)).toBe(true);
    f.query.mockResolvedValueOnce([]);
    expect(await store.lockDelivery(deliveryId, customerId)).toBe(false);
    f.query.mockResolvedValueOnce([]);
    expect(await store.deliveryUsed(deliveryId)).toBe(false);
    expect(await store.reserve(row().id, 1)).toBe(true);
    f.query.mockResolvedValueOnce([[], 0]);
    expect(await store.reserve(row().id, 1)).toBe(false);
    await store.insert(stored);
    expect(f.insert.mock.calls[0][0].reservationExpiresAt).toBeInstanceOf(Date);
    return { ok: true, value: 'committed' };
  });
  expect(result).toEqual({ ok: true, value: 'committed' });
  expect(f.query).toHaveBeenCalledWith(
    expect.stringContaining('pg_advisory_xact_lock'),
    [customerId, 'request-0001'],
  );
});
it('un Result fallido obliga rollback; las excepciones no filtran detalles', async () => {
  const f = fixture();
  expect(
    await f.unit.run(async () => ({ ok: false, error: 'InsufficientStock' })),
  ).toEqual({ ok: false, error: 'InsufficientStock' });
  await expect(f.transaction.mock.results[0].value).rejects.toBeDefined();
  expect(
    await f.unit.run(async () => {
      throw new Error('private query');
    }),
  ).toEqual(unavailable);
  f.getOne.mockResolvedValueOnce({ ...row(), stockReserved: 100 });
  expect(
    await f.unit.run(async (store) => ({
      ok: true,
      value: await store.lockProduct(row().id),
    })),
  ).toEqual(unavailable);
});
it('migración crea relaciones y restricciones sin columnas para tarjeta; rollback ordenado', async () => {
  const query = jest.fn().mockResolvedValue(undefined);
  const runner = { query } as unknown as QueryRunner;
  const migration = new CreateCheckout1794528001000();
  await migration.up(runner);
  const sql = query.mock.calls.map((call) => call[0]).join(' ');
  expect(sql).toContain('UNIQUE(customer_id,idempotency_key)');
  expect(sql).toContain('FOREIGN KEY(delivery_id,customer_id)');
  expect(sql).toContain('payment_started_at TIMESTAMPTZ');
  expect(sql).not.toMatch(/card_number|cvv|cvc/);
  await migration.down(runner);
  expect(query.mock.calls.slice(-3).map((call) => call[0])).toEqual([
    'DROP TABLE transactions',
    'DROP TABLE deliveries',
    'DROP TABLE customers',
  ]);
});
