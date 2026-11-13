jest.mock('../src/shared/infrastructure/database/data-source', () => ({
  __esModule: true,
  default: { initialize: jest.fn(), destroy: jest.fn() },
}));
jest.mock('../src/shared/infrastructure/database/seed-products', () => ({
  seedProducts: jest.fn(),
}));
import source from '../src/shared/infrastructure/database/data-source';
import { seedProducts } from '../src/shared/infrastructure/database/seed-products';
import { runSeed } from '../src/shared/infrastructure/database/seed';
beforeEach(() => jest.resetAllMocks());
it('inicializa y cierra la conexion tras insertar', async () => {
  await runSeed();
  expect(source.initialize).toHaveBeenCalled();
  expect(seedProducts).toHaveBeenCalledWith(source);
  expect(source.destroy).toHaveBeenCalled();
});
it('cierra la conexion y propaga fallo del seed', async () => {
  jest.mocked(seedProducts).mockRejectedValue(new Error('Seed failed'));
  await expect(runSeed()).rejects.toThrow('Seed failed');
  expect(source.destroy).toHaveBeenCalled();
});
it('no intenta destruir una conexion que no se pudo abrir', async () => {
  jest.mocked(source.initialize).mockRejectedValue(new Error('Connect failed'));
  await expect(runSeed()).rejects.toThrow('Connect failed');
  expect(source.destroy).not.toHaveBeenCalled();
});
