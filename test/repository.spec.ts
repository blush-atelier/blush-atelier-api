import { Logger } from '@nestjs/common';
import { Repository } from 'typeorm';
import { TypeOrmProductRepository } from '../src/products/infrastructure/typeorm-product.repository';
import { ProductOrmEntity } from '../src/products/infrastructure/product.orm-entity';
import { row, productData } from './fixtures';

let find: jest.Mock;
let findOneBy: jest.Mock;
let adapter: TypeOrmProductRepository;
beforeEach(() => {
  jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  find = jest.fn();
  findOneBy = jest.fn();
  adapter = new TypeOrmProductRepository({
    find,
    findOneBy,
  } as unknown as Repository<ProductOrmEntity>);
});
afterEach(() => jest.restoreAllMocks());
it('mapea ORM a dominio con precio exacto y orden por SKU', async () => {
  find.mockResolvedValue([{ ...row(), priceMinor: '9007199254740993' }]);
  const result = await adapter.findAll();
  expect(result.ok && result.value[0].data.priceMinor).toBe(9007199254740993n);
  expect(result.ok && result.value[0].data).not.toHaveProperty('createdAt');
  expect(find).toHaveBeenCalledWith({ order: { sku: 'ASC' } });
});
it('consulta parametrizada por ID y distingue ausencia', async () => {
  findOneBy.mockResolvedValueOnce(row()).mockResolvedValueOnce(null);
  expect(await adapter.findById(productData.id)).toMatchObject({
    ok: true,
    value: { data: { id: productData.id } },
  });
  expect(findOneBy).toHaveBeenCalledWith({ id: productData.id });
  expect(await adapter.findById(productData.id)).toEqual({
    ok: true,
    value: null,
  });
});
it('no filtra errores del driver al cliente o al log', async () => {
  find.mockRejectedValue(new Error('private connection details'));
  findOneBy.mockRejectedValue(new Error('private connection details'));
  expect(await adapter.findAll()).toEqual({
    ok: false,
    error: 'ProductStorageUnavailable',
  });
  expect(await adapter.findById(productData.id)).toEqual({
    ok: false,
    error: 'ProductStorageUnavailable',
  });
  expect(
    JSON.stringify((Logger.prototype.error as jest.Mock).mock.calls),
  ).not.toContain('private');
});
it('rechaza datos persistidos que violan invariantes', async () => {
  find.mockResolvedValue([{ ...row(), stockReserved: 100 }]);
  expect(await adapter.findAll()).toEqual({
    ok: false,
    error: 'ProductStorageUnavailable',
  });
});
