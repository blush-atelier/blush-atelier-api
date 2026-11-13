import { GetProduct } from '../src/products/application/get-product';
import { ListProducts } from '../src/products/application/list-products';
import type { ProductRepository } from '../src/products/domain/product-repository.port';
import { product, productData } from './fixtures';

const repository = (): jest.Mocked<ProductRepository> => ({
  findAll: jest.fn(),
  findById: jest.fn(),
});
it('lista productos y serializa centavos sin perdida', async () => {
  const port = repository();
  port.findAll.mockResolvedValue({
    ok: true,
    value: [product({ priceMinor: 9007199254740993n })],
  });
  const result = await new ListProducts(port).execute();
  expect(result).toMatchObject({
    ok: true,
    value: [{ priceMinor: '9007199254740993', availableStock: 18 }],
  });
  expect(() => JSON.stringify(result)).not.toThrow();
});
it('devuelve lista vacia cuando no hay productos', async () => {
  const port = repository();
  port.findAll.mockResolvedValue({ ok: true, value: [] });
  expect(await new ListProducts(port).execute()).toEqual({
    ok: true,
    value: [],
  });
});
it('propaga fallo de lectura al listar', async () => {
  const port = repository();
  port.findAll.mockResolvedValue({
    ok: false,
    error: 'ProductStorageUnavailable',
  });
  expect(await new ListProducts(port).execute()).toEqual({
    ok: false,
    error: 'ProductStorageUnavailable',
  });
});
it('consulta por ID y devuelve vista publica', async () => {
  const port = repository();
  port.findById.mockResolvedValue({ ok: true, value: product() });
  expect(await new GetProduct(port).execute(productData.id)).toMatchObject({
    ok: true,
    value: { id: productData.id, priceMinor: '8990000' },
  });
  expect(port.findById).toHaveBeenCalledWith(productData.id);
});
it('distingue inexistente de servicio no disponible', async () => {
  const port = repository();
  port.findById.mockResolvedValueOnce({ ok: true, value: null });
  expect(await new GetProduct(port).execute(productData.id)).toEqual({
    ok: false,
    error: 'ProductNotFound',
  });
  port.findById.mockResolvedValueOnce({
    ok: false,
    error: 'ProductStorageUnavailable',
  });
  expect(await new GetProduct(port).execute(productData.id)).toEqual({
    ok: false,
    error: 'ProductStorageUnavailable',
  });
});
