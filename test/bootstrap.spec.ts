import { NestFactory } from '@nestjs/core';
import { bootstrap } from '../src/bootstrap/main';
import { configureApp } from '../src/bootstrap/configure-app';

jest.mock('../src/bootstrap/app.module', () => ({ AppModule: class {} }));
jest.mock('../src/bootstrap/configure-app', () => ({
  configureApp: jest.fn(),
}));
const originalPort = process.env.PORT;
afterEach(() => {
  if (originalPort === undefined) delete process.env.PORT;
  else process.env.PORT = originalPort;
  jest.restoreAllMocks();
});
it('arranca con puerto default y permite cierre ordenado', async () => {
  delete process.env.PORT;
  const app = {
    enableShutdownHooks: jest.fn(),
    listen: jest.fn().mockResolvedValue(undefined),
  };
  jest.spyOn(NestFactory, 'create').mockResolvedValue(app as never);
  await bootstrap();
  expect(configureApp).toHaveBeenCalledWith(app);
  expect(app.enableShutdownHooks).toHaveBeenCalled();
  expect(app.listen).toHaveBeenCalledWith(3000, '0.0.0.0');
});
it('usa puerto configurado', async () => {
  process.env.PORT = '3001';
  const app = {
    enableShutdownHooks: jest.fn(),
    listen: jest.fn().mockResolvedValue(undefined),
  };
  jest.spyOn(NestFactory, 'create').mockResolvedValue(app as never);
  await bootstrap();
  expect(app.listen).toHaveBeenCalledWith(3001, '0.0.0.0');
});
it.each(['0', '65536', 'abc'])(
  'rechaza puerto %s antes de crear servidor',
  async (port) => {
    process.env.PORT = port;
    const create = jest.spyOn(NestFactory, 'create');
    await expect(bootstrap()).rejects.toThrow('Invalid PORT');
    expect(create).not.toHaveBeenCalled();
  },
);
