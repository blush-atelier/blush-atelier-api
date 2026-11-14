import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { GetProduct } from '../src/products/application/get-product';
import { ListProducts } from '../src/products/application/list-products';
import { ProductsController } from '../src/products/infrastructure/products.controller';
import { configureApp } from '../src/bootstrap/configure-app';
import { productData } from './fixtures';

let app: INestApplication;
const list = jest.fn();
const get = jest.fn();
beforeAll(async () => {
  const module = await Test.createTestingModule({
    controllers: [ProductsController],
    providers: [
      { provide: ListProducts, useValue: { execute: list } },
      { provide: GetProduct, useValue: { execute: get } },
    ],
  }).compile();
  app = module.createNestApplication({ bodyParser: false });
  configureApp(app, { FRONTEND_ORIGIN: 'http://localhost:5173' });
  await app.init();
});
afterAll(async () => {
  await app.close();
});
beforeEach(() => jest.resetAllMocks());
it('sirve listado, CORS autorizado y cabeceras de seguridad', async () => {
  list.mockResolvedValue({
    ok: true,
    value: [{ id: productData.id, priceMinor: '8990000' }],
  });
  const response = await request(app.getHttpServer())
    .get('/api/products')
    .set('Origin', 'http://localhost:5173')
    .expect(200);
  expect(response.body).toEqual([
    { id: productData.id, priceMinor: '8990000' },
  ]);
  expect(response.headers['access-control-allow-origin']).toBe(
    'http://localhost:5173',
  );
  expect(response.headers['x-content-type-options']).toBe('nosniff');
});
it('no autoriza otro origen en CORS', async () => {
  list.mockResolvedValue({ ok: true, value: [] });
  const response = await request(app.getHttpServer())
    .get('/api/products')
    .set('Origin', 'https://other.example')
    .expect(200);
  expect(response.headers['access-control-allow-origin']).not.toBe(
    'https://other.example',
  );
});
it('rechaza UUID invalido antes de llamar al caso de uso', async () => {
  await request(app.getHttpServer())
    .get('/api/products/not-a-uuid')
    .expect(400);
  expect(get).not.toHaveBeenCalled();
});
it('consulta un producto por UUID', async () => {
  get.mockResolvedValue({ ok: true, value: { id: productData.id } });
  await request(app.getHttpServer())
    .get(`/api/products/${productData.id}`)
    .expect(200, { id: productData.id });
  expect(get).toHaveBeenCalledWith(productData.id);
});
it('mapea inexistente a 404 y almacenamiento a 503', async () => {
  get.mockResolvedValueOnce({ ok: false, error: 'ProductNotFound' });
  await request(app.getHttpServer())
    .get(`/api/products/${productData.id}`)
    .expect(404);
  get.mockResolvedValueOnce({ ok: false, error: 'ProductStorageUnavailable' });
  await request(app.getHttpServer())
    .get(`/api/products/${productData.id}`)
    .expect(503);
  list.mockResolvedValueOnce({ ok: false, error: 'ProductStorageUnavailable' });
  await request(app.getHttpServer()).get('/api/products').expect(503);
});
it('publica contrato Swagger local', async () => {
  const response = await request(app.getHttpServer())
    .get('/docs-json')
    .expect(200);
  expect(response.body.paths['/api/products']).toBeDefined();
  expect(response.body.paths['/api/products/{id}']).toBeDefined();
  expect(
    response.body.components.schemas.ProductResponseDto.properties.priceMinor
      .type,
  ).toBe('string');
  expect(
    response.body.paths['/api/products'].get.responses['200'].content[
      'application/json'
    ].schema.type,
  ).toBe('array');
});
it('rechaza origen ausente, con ruta o HTTP en produccion', () => {
  expect(() => configureApp(app, {})).toThrow('FRONTEND_ORIGIN');
  expect(() =>
    configureApp(app, { FRONTEND_ORIGIN: 'https://store.test/path' }),
  ).toThrow('FRONTEND_ORIGIN');
  expect(() =>
    configureApp(app, {
      NODE_ENV: 'production',
      FRONTEND_ORIGIN: 'http://store.test',
    }),
  ).toThrow('HTTPS');
});
