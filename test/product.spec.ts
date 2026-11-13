import { Product } from '../src/products/domain/product';
import { productData, product } from './fixtures';

it('calcula disponibilidad sin mutar las existencias', () => {
  const item = product();
  expect(item.availableStock).toBe(18);
  expect(item.data.stockOnHand).toBe(20);
  expect(Object.isFrozen(item.data)).toBe(true);
});
it('conserva un precio mayor que MAX_SAFE_INTEGER', () => {
  expect(product({ priceMinor: 9007199254740993n }).data.priceMinor).toBe(
    9007199254740993n,
  );
});
it.each([
  { id: '' },
  { sku: ' ' },
  { name: '' },
  { priceMinor: -1n },
  { priceMinor: 9223372036854775808n },
  { stockOnHand: -1 },
  { stockOnHand: 2147483648 },
  { stockOnHand: 1.5 },
  { stockReserved: 0.5 },
  { stockReserved: -1 },
  { stockReserved: 21 },
  { currency: 'USD' as 'COP' },
])('rechaza invariantes invalidas %p', (changes) => {
  expect(Product.create({ ...productData, ...changes })).toEqual({
    ok: false,
    error: 'InvalidProduct',
  });
});
it('admite agotado y precio cero', () => {
  expect(
    product({ priceMinor: 0n, stockOnHand: 0, stockReserved: 0 })
      .availableStock,
  ).toBe(0);
});
