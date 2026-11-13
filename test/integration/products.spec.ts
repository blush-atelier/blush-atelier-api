import 'reflect-metadata';
import 'dotenv/config';
import { DataSource } from 'typeorm';
import { Test } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { databaseOptions } from '../../src/shared/infrastructure/database/database-options';
import { seedProducts } from '../../src/shared/infrastructure/database/seed-products';
import { ProductsModule } from '../../src/products/infrastructure/products.module';
import { configureApp } from '../../src/bootstrap/configure-app';

let source: DataSource;
let app: INestApplication;
const id = '11111111-1111-4111-8111-111111111111';
beforeAll(async () => {
  if (!process.env.POSTGRES_DB?.endsWith('_test'))
    throw new Error(
      'Integration requires a disposable database ending in _test',
    );
  source = new DataSource(databaseOptions());
  await source.initialize();
  await source.runMigrations();
  await seedProducts(source);
  const module = await Test.createTestingModule({
    imports: [TypeOrmModule.forRoot(databaseOptions()), ProductsModule],
  }).compile();
  app = module.createNestApplication({ bodyParser: false });
  configureApp(app, { FRONTEND_ORIGIN: 'http://localhost:5173' });
  await app.init();
}, 30000);
afterAll(async () => {
  if (app) await app.close();
  if (source?.isInitialized) await source.destroy();
});
it('sirve seed desde PostgreSQL mediante todas las capas', async () => {
  const list = await request(app.getHttpServer())
    .get('/api/products')
    .expect(200);
  expect(list.body).toHaveLength(2);
  const detail = await request(app.getHttpServer())
    .get(`/api/products/${id}`)
    .expect(200);
  expect(detail.body).toMatchObject({
    priceMinor: '8990000',
    availableStock: 20,
    currency: 'COP',
  });
});
it('seed repetido preserva reservas y precio existente', async () => {
  await source.query('UPDATE products SET stock_reserved = 3 WHERE id = $1', [
    id,
  ]);
  try {
    await seedProducts(source);
    const detail = await request(app.getHttpServer())
      .get(`/api/products/${id}`)
      .expect(200);
    expect(detail.body.availableStock).toBe(17);
  } finally {
    await source.query('UPDATE products SET stock_reserved = 0 WHERE id = $1', [
      id,
    ]);
  }
});
it('PostgreSQL conserva precio mayor a MAX_SAFE_INTEGER', async () => {
  await source.query('UPDATE products SET price_minor = $1 WHERE id = $2', [
    '9007199254740993',
    id,
  ]);
  try {
    const detail = await request(app.getHttpServer())
      .get(`/api/products/${id}`)
      .expect(200);
    expect(detail.body.priceMinor).toBe('9007199254740993');
  } finally {
    await source.query('UPDATE products SET price_minor = $1 WHERE id = $2', [
      '8990000',
      id,
    ]);
  }
});
it('rechaza reservas superiores al stock y dinero negativo', async () => {
  await expect(
    source.query(
      'UPDATE products SET stock_reserved = stock_on_hand + 1 WHERE id = $1',
      [id],
    ),
  ).rejects.toThrow();
  await expect(
    source.query('UPDATE products SET price_minor = -1 WHERE id = $1', [id]),
  ).rejects.toThrow();
});
it('responde 404 para un UUID inexistente', async () => {
  await request(app.getHttpServer())
    .get('/api/products/33333333-3333-4333-8333-333333333333')
    .expect(404);
});
it('rollback y reaplicacion de migracion funcionan en base desechable', async () => {
  await source.undoLastMigration();
  await source.undoLastMigration();
  await expect(source.query('SELECT * FROM products')).rejects.toThrow();
  await source.runMigrations();
  await seedProducts(source);
  const response = await request(app.getHttpServer())
    .get('/api/products')
    .expect(200);
  expect(response.body).toHaveLength(2);
});
