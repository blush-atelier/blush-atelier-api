import { Controller, Post, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { configureApp } from '../src/bootstrap/configure-app';

@Controller()
class SwaggerFixtureController {
  @Post('customers')
  customer() {
    return { received: true };
  }

  @Post('payments/wompi/events')
  event() {
    return { received: true };
  }
}

async function createApp(env: NodeJS.ProcessEnv) {
  const module = await Test.createTestingModule({
    controllers: [SwaggerFixtureController],
  }).compile();
  const app = module.createNestApplication({ bodyParser: false });
  configureApp(app, { FRONTEND_ORIGIN: 'https://store.example', ...env });
  await app.init();
  return app;
}

let app: INestApplication | undefined;
afterEach(async () => {
  await app?.close();
  app = undefined;
});

it('conserva UI y JSON en desarrollo sin duplicar el prefijo', async () => {
  app = await createApp({ NODE_ENV: 'development', SWAGGER_ENABLED: 'false' });
  await request(app.getHttpServer()).get('/docs').expect(200);
  const { body } = await request(app.getHttpServer())
    .get('/docs-json')
    .expect(200);
  expect(body.paths['/api/customers'].post.parameters).toContainEqual(
    expect.objectContaining({
      name: 'X-Checkout-Request',
      in: 'header',
      required: true,
      schema: { type: 'string', enum: ['1'], default: '1' },
    }),
  );
  expect(body.paths['/api/payments/wompi/events'].post.parameters).not.toEqual(
    expect.arrayContaining([
      expect.objectContaining({ name: 'X-Checkout-Request' }),
    ]),
  );
  await request(app.getHttpServer()).get('/api/docs').expect(404);
  await request(app.getHttpServer()).get('/api/docs-json').expect(404);
});

it.each([undefined, 'false', 'TRUE', '1', ''])(
  'no publica Swagger en produccion con SWAGGER_ENABLED=%s',
  async (enabled) => {
    app = await createApp({ NODE_ENV: 'production', SWAGGER_ENABLED: enabled });
    for (const path of ['/docs', '/docs-json', '/api/docs', '/api/docs-json'])
      await request(app.getHttpServer()).get(path).expect(404);
  },
);

it('publica solo las rutas explicitas de produccion cuando se habilita', async () => {
  app = await createApp({ NODE_ENV: 'production', SWAGGER_ENABLED: 'true' });
  await request(app.getHttpServer()).get('/api/docs').expect(200);
  const response = await request(app.getHttpServer())
    .get('/api/docs-json')
    .expect(200);
  expect(response.body.paths).toHaveProperty('/api/customers');
  expect(response.headers['cache-control']).toBe('no-store');
  expect(response.headers['x-content-type-options']).toBe('nosniff');
  for (const path of ['/docs', '/docs-json', '/api/api/docs'])
    await request(app.getHttpServer()).get(path).expect(404);
});

it('conserva la cabecera obligatoria y la excepcion del webhook', async () => {
  app = await createApp({ NODE_ENV: 'production' });
  await request(app.getHttpServer())
    .post('/api/customers')
    .send({})
    .expect(403);
  await request(app.getHttpServer())
    .post('/api/customers')
    .set('X-Checkout-Request', '1')
    .send({})
    .expect(201);
  await request(app.getHttpServer())
    .post('/api/payments/wompi/events')
    .send({})
    .expect(201);
});
