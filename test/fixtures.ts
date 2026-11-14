import { Product, type ProductData } from '../src/products/domain/product';
import { ProductOrmEntity } from '../src/products/infrastructure/product.orm-entity';

export const productData: ProductData = {
  id: '11111111-1111-4111-8111-111111111111',
  sku: 'BLUSH-ROSE-01',
  name: 'Rubor Rose',
  description: 'Rubor suave.',
  imageUrl: null,
  priceMinor: 8990000n,
  currency: 'COP',
  stockOnHand: 20,
  stockReserved: 2,
};
export function product(overrides: Partial<ProductData> = {}): Product {
  const result = Product.create({ ...productData, ...overrides });
  if (!result.ok) throw new Error('Invalid fixture');
  return result.value;
}
export function row(): ProductOrmEntity {
  return Object.assign(new ProductOrmEntity(), {
    ...productData,
    priceMinor: productData.priceMinor.toString(),
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
  });
}
export const dbEnv = {
  POSTGRES_HOST: 'localhost',
  POSTGRES_DB: 'test',
  POSTGRES_USER: 'test',
  POSTGRES_PASSWORD: 'test-only',
};
