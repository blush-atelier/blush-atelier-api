import { calculateBasket } from '../src/transactions/domain/pricing';
import { Product } from '../src/products/domain/product';
import { CreatePendingTransaction } from '../src/transactions/application/create-pending-transaction';
import { QuoteCheckout } from '../src/transactions/application/quote-checkout';
import {
  fees,
  runtime,
  storeFixture,
  unitFixture,
  customerId,
  quoteInput,
  pendingInput,
} from './checkout-fixtures';
import { product, productData } from './fixtures';
const otherId = '22222222-2222-4222-8222-222222222222';
function other(price = 5990000n) {
  const result = Product.create({
    ...productData,
    id: otherId,
    priceMinor: price,
    stockReserved: 0,
  });
  if (!result.ok) throw new Error('fixture');
  return result.value;
}
it('suma líneas exactas y tarifas solo una vez', () => {
  const result = calculateBasket(
    [product({ stockReserved: 0 }), other()],
    [2, 3],
    fees,
  );
  expect(result).toMatchObject({
    ok: true,
    value: {
      productAmountMinor: '35950000',
      totalMinor: '37450000',
      items: [
        {
          productId: productData.id,
          quantity: 2,
          productAmountMinor: '17980000',
        },
        { productId: otherId, quantity: 3, productAmountMinor: '17970000' },
      ],
    },
  });
  expect(calculateBasket([], [], fees)).toEqual({
    ok: false,
    error: 'InvalidCheckout',
  });
  expect(calculateBasket([other(), other()], [1, 1], fees)).toEqual({
    ok: false,
    error: 'InvalidCheckout',
  });
  expect(
    calculateBasket(Array(51).fill(other()), Array(51).fill(1), fees),
  ).toEqual({ ok: false, error: 'InvalidCheckout' });
  expect(calculateBasket([other()], [0], fees)).toEqual({
    ok: false,
    error: 'InvalidCheckout',
  });
  expect(
    calculateBasket(
      [
        product({ priceMinor: 4611686018427387900n, stockReserved: 0 }),
        other(4611686018427387900n),
      ],
      [1, 1],
      fees,
    ),
  ).toEqual({ ok: false, error: 'AmountOutOfRange' });
});
it('compone una reserva multi-producto y devuelve todos los snapshots', async () => {
  const store = storeFixture();
  store.lockProduct.mockImplementation(async (id) =>
    id === otherId ? other() : product({ stockReserved: 0 }),
  );
  const usecase = new CreatePendingTransaction(
    unitFixture(store),
    fees,
    runtime,
  );
  const items = [
    { productId: productData.id, quantity: 2 },
    { productId: otherId, quantity: 3 },
  ];
  const result = await usecase.execute(customerId, 'basket-request', {
    ...pendingInput,
    quantity: 2,
    items,
    expectedTotalMinor: '37450000',
  });
  expect(result).toMatchObject({
    ok: true,
    value: {
      items: expect.arrayContaining([
        {
          productId: otherId,
          quantity: 3,
          unitPriceMinor: '5990000',
          productAmountMinor: '17970000',
        },
      ]),
    },
  });
  expect(store.reserve.mock.calls).toEqual([
    [productData.id, 2],
    [otherId, 3],
  ]);
  const saved = store.insert.mock.calls[0][0];
  store.findByKey.mockResolvedValue(saved);
  const reordered = [items[1], items[0]];
  const retry = await usecase.execute(customerId, 'basket-request', {
    ...pendingInput,
    ...reordered[0],
    items: reordered,
    expectedTotalMinor: '37450000',
  });
  expect(retry).toEqual(result);
  expect(store.insert).toHaveBeenCalledTimes(1);
});
it('rechaza carritos vacíos, repetidos o con primera línea contradictoria antes de reservar', async () => {
  for (const items of [
    [],
    [{ productId: otherId, quantity: 1 }],
    [
      { productId: productData.id, quantity: 1 },
      { productId: productData.id, quantity: 1 },
    ],
  ]) {
    const store = storeFixture(),
      unit = unitFixture(store);
    expect(
      await new QuoteCheckout(unit, fees, runtime).execute(customerId, {
        ...quoteInput,
        items,
      }),
    ).toEqual({ ok: false, error: 'InvalidCheckout' });
    expect(
      await new CreatePendingTransaction(unit, fees, runtime).execute(
        customerId,
        'basket-request',
        { ...pendingInput, items },
      ),
    ).toEqual({ ok: false, error: 'InvalidCheckout' });
    expect(store.reserve).not.toHaveBeenCalled();
  }
});
