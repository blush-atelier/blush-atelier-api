import { createCustomer } from '../src/customers/domain/customer';
import { createDelivery } from '../src/deliveries/domain/delivery';
import { calculateQuote } from '../src/transactions/domain/pricing';
import { MAX_MONEY, validText } from '../src/shared/domain/checkout';
import { checkoutFees } from '../src/transactions/infrastructure/transactions.module';
import { product } from './fixtures';
import {
  customerInput,
  deliveryInput,
  customerId,
  deliveryId,
  fees,
} from './checkout-fixtures';
it('normaliza contacto y dirección sin mezclar propietario con datos del cliente', () => {
  expect(createCustomer(customerId, customerInput)).toEqual({
    ok: true,
    value: {
      id: customerId,
      fullName: 'Ana Prueba',
      email: 'ana@example.com',
      phone: '+573001234567',
    },
  });
  expect(createDelivery(deliveryId, customerId, deliveryInput)).toMatchObject({
    ok: true,
    value: { customerId, addressLine: 'Calle 10 # 20-30', city: 'Bogotá' },
  });
});
it.each([
  { fullName: '' },
  { fullName: '123456' },
  { email: 'wrong' },
  { phone: 'abc' },
  { fullName: 'A'.repeat(121) },
  { email: 'a'.repeat(255) + '@test.co' },
])('rechaza cliente inválido %p', (changes) => {
  expect(createCustomer(customerId, { ...customerInput, ...changes })).toEqual({
    ok: false,
    error: 'InvalidCustomer',
  });
});
it.each([
  { recipientName: '' },
  { recipientName: '123456' },
  { recipientPhone: 'abc' },
  { addressLine: 'a' },
  { city: '' },
  { region: '' },
  { countryCode: 'US' },
])('rechaza entrega inválida %p', (changes) => {
  expect(
    createDelivery(deliveryId, customerId, { ...deliveryInput, ...changes }),
  ).toEqual({ ok: false, error: 'InvalidDelivery' });
});
it('rechaza controles y texto inválido', () => {
  expect(validText('Ana\nPrueba', 2, 100)).toBe(false);
  expect(validText('a', 2, 100)).toBe(false);
  expect(validText('b'.repeat(101), 2, 100)).toBe(false);
});
it('cotiza con unidades menores exactas sin reservar', () => {
  const item = product({ stockReserved: 0 });
  expect(calculateQuote(item, 2, fees)).toMatchObject({
    ok: true,
    value: {
      productAmountMinor: '17980000',
      baseFeeMinor: '500000',
      deliveryFeeMinor: '1000000',
      totalMinor: '19480000',
    },
  });
  expect(item.data.stockReserved).toBe(0);
});
it.each([0, -1, 1.5, 2147483648])('rechaza cantidad %s', (quantity) =>
  expect(calculateQuote(product(), quantity, fees)).toEqual({
    ok: false,
    error: 'InvalidCheckout',
  }),
);
it('rechaza stock insuficiente, tarifas inválidas y overflow BIGINT', () => {
  expect(calculateQuote(product(), 19, fees)).toEqual({
    ok: false,
    error: 'InsufficientStock',
  });
  expect(calculateQuote(product(), 1, { ...fees, baseFeeMinor: 0n })).toEqual({
    ok: false,
    error: 'InvalidCheckout',
  });
  expect(
    calculateQuote(product(), 1, { ...fees, deliveryFeeMinor: -1n }),
  ).toEqual({ ok: false, error: 'InvalidCheckout' });
  expect(calculateQuote(product({ priceMinor: MAX_MONEY }), 1, fees)).toEqual({
    ok: false,
    error: 'AmountOutOfRange',
  });
  expect(
    calculateQuote(product({ priceMinor: 9007199254740993n }), 1, fees),
  ).toMatchObject({ ok: true, value: { totalMinor: '9007199256240993' } });
});
it('tarifas locales explícitas; producción debe configurarlas y validarlas', () => {
  expect(checkoutFees({})).toEqual(fees);
  expect(
    checkoutFees({ BASE_FEE_MINOR: '100', DELIVERY_FEE_MINOR: '0' }),
  ).toEqual({ baseFeeMinor: 100n, deliveryFeeMinor: 0n });
  expect(() => checkoutFees({ NODE_ENV: 'production' })).toThrow('Configure');
  expect(() =>
    checkoutFees({ NODE_ENV: 'production', BASE_FEE_MINOR: '1' }),
  ).toThrow('Configure');
  for (const env of [
    { BASE_FEE_MINOR: '0' },
    { BASE_FEE_MINOR: '-1' },
    { DELIVERY_FEE_MINOR: 'x' },
    { BASE_FEE_MINOR: MAX_MONEY.toString() },
  ])
    expect(() => checkoutFees(env)).toThrow('Invalid');
});
