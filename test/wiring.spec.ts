import { Test } from '@nestjs/testing';
import { getDataSourceToken, getRepositoryToken } from '@nestjs/typeorm';
import { AppModule } from '../src/bootstrap/app.module';
import { ListProducts } from '../src/products/application/list-products';
import { GetProduct } from '../src/products/application/get-product';
import { ProductOrmEntity } from '../src/products/infrastructure/product.orm-entity';
import { PRODUCT_REPOSITORY } from '../src/products/domain/product-repository.port';
import { TypeOrmProductRepository } from '../src/products/infrastructure/typeorm-product.repository';
import { dbEnv, row, productData } from './fixtures';

it('conecta modulo real, puertos y casos de uso sin acceso a red', async () => {
  const previous = { ...process.env };
  Object.assign(process.env, dbEnv);
  try {
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(getDataSourceToken())
      .useValue({ isInitialized: false })
      .overrideProvider(getRepositoryToken(ProductOrmEntity))
      .useValue({
        find: jest.fn().mockResolvedValue([row()]),
        findOneBy: jest.fn().mockResolvedValue(row()),
      })
      .compile();
    try {
      expect(module.get(PRODUCT_REPOSITORY)).toBeInstanceOf(
        TypeOrmProductRepository,
      );
      expect(await module.get(ListProducts).execute()).toMatchObject({
        ok: true,
        value: [{ priceMinor: '8990000' }],
      });
      expect(
        await module.get(GetProduct).execute(productData.id),
      ).toMatchObject({ ok: true, value: { id: productData.id } });
    } finally {
      await module.close();
    }
  } finally {
    process.env = previous;
  }
});
it('el DataSource CLI usa las mismas migraciones sin abrir conexiones al importar', async () => {
  const previous = { ...process.env };
  Object.assign(process.env, dbEnv);
  try {
    const { default: source } =
      await import('../src/shared/infrastructure/database/data-source');
    expect(source.isInitialized).toBe(false);
    expect(source.options.synchronize).toBe(false);
    expect(source.options.migrations).toHaveLength(5);
  } finally {
    process.env = previous;
  }
});
