import { RegisterCustomer } from '../src/customers/application/register-customer';
import { AuthenticateCheckout } from '../src/customers/application/authenticate-checkout';
import { RegisterDelivery } from '../src/deliveries/application/register-delivery';
import { QuoteCheckout } from '../src/transactions/application/quote-checkout';
import { CreatePendingTransaction } from '../src/transactions/application/create-pending-transaction';
import { GetTransaction } from '../src/transactions/application/get-transaction';
import type { CustomerRepository } from '../src/customers/domain/customer-repository.port';
import type { DeliveryRepository } from '../src/deliveries/domain/delivery-repository.port';
import { product } from './fixtures';
import {
  customerInput,
  deliveryInput,
  customerId,
  fees,
  runtime,
  quoteInput,
  pendingInput,
  stored,
  storeFixture,
  unitFixture,
} from './checkout-fixtures';
const unavailable = {
  ok: false as const,
  error: 'CheckoutStorageUnavailable' as const,
};
it('registra cliente guardando solo hash y vencimiento de la credencial', async () => {
  const port: jest.Mocked<CustomerRepository> = {
    insert: jest.fn().mockResolvedValue({ ok: true, value: undefined }),
    findSession: jest.fn(),
  };
  const useCase = new RegisterCustomer(port, runtime);
  expect(await useCase.execute(customerInput)).toEqual({
    ok: true,
    value: { id: runtime.id(), sessionToken: runtime.token() },
  });
  expect(port.insert.mock.calls[0][1]).toBe(runtime.hash(runtime.token()));
  expect(port.insert.mock.calls[0][2].toISOString()).toBe(
    '2026-11-13T13:00:00.000Z',
  );
  expect(await useCase.execute({ ...customerInput, email: 'invalid' })).toEqual(
    { ok: false, error: 'InvalidCustomer' },
  );
  port.insert.mockResolvedValueOnce(unavailable);
  expect(await useCase.execute(customerInput)).toEqual(unavailable);
});
it('autentica sesión válida y distingue expiración, ausencia y almacenamiento', async () => {
  const port: jest.Mocked<CustomerRepository> = {
    insert: jest.fn(),
    findSession: jest.fn(),
  };
  const useCase = new AuthenticateCheckout(port, runtime);
  expect(await useCase.execute('wrong')).toEqual({
    ok: false,
    error: 'SessionRequired',
  });
  expect(port.findSession).not.toHaveBeenCalled();
  port.findSession.mockResolvedValueOnce({
    ok: true,
    value: { customerId, expiresAt: new Date('2026-11-13T13:00:00Z') },
  });
  expect(await useCase.execute(runtime.token())).toEqual({
    ok: true,
    value: customerId,
  });
  port.findSession.mockResolvedValueOnce({ ok: true, value: null });
  expect(await useCase.execute(runtime.token())).toEqual({
    ok: false,
    error: 'SessionRequired',
  });
  port.findSession.mockResolvedValueOnce({
    ok: true,
    value: { customerId, expiresAt: runtime.now() },
  });
  expect(await useCase.execute(runtime.token())).toEqual({
    ok: false,
    error: 'SessionRequired',
  });
  port.findSession.mockResolvedValueOnce(unavailable);
  expect(await useCase.execute(runtime.token())).toEqual(unavailable);
});
it('registra entrega solo con su propietario y propaga fallos', async () => {
  const port: jest.Mocked<DeliveryRepository> = {
    insert: jest.fn().mockResolvedValue({ ok: true, value: undefined }),
  };
  const useCase = new RegisterDelivery(port, runtime);
  expect(await useCase.execute(customerId, deliveryInput)).toMatchObject({
    ok: true,
  });
  expect(port.insert.mock.calls[0][0].customerId).toBe(customerId);
  expect(
    await useCase.execute(customerId, { ...deliveryInput, city: '' }),
  ).toEqual({ ok: false, error: 'InvalidDelivery' });
  port.insert.mockResolvedValueOnce(unavailable);
  expect(await useCase.execute(customerId, deliveryInput)).toEqual(unavailable);
});
it('cotiza dentro de la unidad de trabajo sin reservar', async () => {
  const store = storeFixture();
  const useCase = new QuoteCheckout(unitFixture(store), fees, runtime);
  expect(await useCase.execute(customerId, quoteInput)).toMatchObject({
    ok: true,
    value: { totalMinor: '10490000' },
  });
  expect(store.reserve).not.toHaveBeenCalled();
  expect(store.releaseExpiredUnstarted).toHaveBeenCalledWith(
    quoteInput.productId,
    runtime.now(),
  );
  store.lockProduct.mockResolvedValueOnce(null);
  expect(await useCase.execute(customerId, quoteInput)).toEqual({
    ok: false,
    error: 'ProductNotFound',
  });
  store.lockDelivery.mockResolvedValueOnce(false);
  expect(await useCase.execute(customerId, quoteInput)).toEqual({
    ok: false,
    error: 'DeliveryNotFound',
  });
});
it('crea PENDING y reserva una sola vez tras todas las validaciones', async () => {
  const store = storeFixture();
  const useCase = new CreatePendingTransaction(
    unitFixture(store),
    fees,
    runtime,
  );
  expect(
    await useCase.execute(customerId, 'request-0001', pendingInput),
  ).toMatchObject({
    ok: true,
    value: {
      status: 'PENDING',
      reservationStatus: 'ACTIVE',
      reservationExpiresAt: '2026-11-13T12:15:00.000Z',
    },
  });
  expect(store.reserve).toHaveBeenCalledWith(quoteInput.productId, 1);
  expect(store.insert).toHaveBeenCalledTimes(1);
  const inserted = store.insert.mock.calls[0][0];
  expect(inserted).not.toHaveProperty('sessionToken');
  store.findByKey.mockResolvedValue(inserted);
  expect(
    await useCase.execute(customerId, 'request-0001', pendingInput),
  ).toMatchObject({ ok: true, value: { id: inserted.id } });
  expect(store.reserve).toHaveBeenCalledTimes(1);
  expect(
    await useCase.execute(customerId, 'request-0001', {
      ...pendingInput,
      quantity: 2,
    }),
  ).toEqual({ ok: false, error: 'IdempotencyConflict' });
});
it('rechaza clave o total mal formado antes de ejecutar efectos', async () => {
  const store = storeFixture();
  const useCase = new CreatePendingTransaction(
    unitFixture(store),
    fees,
    runtime,
  );
  expect(await useCase.execute(customerId, 'x', pendingInput)).toEqual({
    ok: false,
    error: 'InvalidCheckout',
  });
  expect(
    await useCase.execute(customerId, 'request-0001', {
      ...pendingInput,
      expectedTotalMinor: '1.5',
    }),
  ).toEqual({ ok: false, error: 'InvalidCheckout' });
  expect(store.lockRequest).not.toHaveBeenCalled();
});
it.each([
  'missing-product',
  'missing-delivery',
  'used-delivery',
  'stock',
  'changed-price',
  'conditional-stock',
])('rechaza %s sin insertar transacción', async (scenario) => {
  const store = storeFixture();
  if (scenario === 'missing-product') store.lockProduct.mockResolvedValue(null);
  if (scenario === 'missing-delivery')
    store.lockDelivery.mockResolvedValue(false);
  if (scenario === 'used-delivery') store.deliveryUsed.mockResolvedValue(true);
  if (scenario === 'stock')
    store.lockProduct.mockResolvedValue(
      product({ stockOnHand: 0, stockReserved: 0 }),
    );
  if (scenario === 'changed-price')
    store.lockProduct.mockResolvedValue(product({ priceMinor: 9990000n }));
  if (scenario === 'conditional-stock') store.reserve.mockResolvedValue(false);
  const errors: Record<string, string> = {
    'missing-product': 'ProductNotFound',
    'missing-delivery': 'DeliveryNotFound',
    'used-delivery': 'DeliveryAlreadyUsed',
    stock: 'InsufficientStock',
    'changed-price': 'QuoteChanged',
    'conditional-stock': 'InsufficientStock',
  };
  expect(
    await new CreatePendingTransaction(
      unitFixture(store),
      fees,
      runtime,
    ).execute(customerId, 'request-0001', pendingInput),
  ).toEqual({ ok: false, error: errors[scenario] });
  expect(store.insert).not.toHaveBeenCalled();
});
it('consulta estado sin exponer cliente o dirección; oculta otras sesiones', async () => {
  const store = storeFixture();
  const useCase = new GetTransaction(unitFixture(store), runtime);
  const result = await useCase.execute(customerId, stored.id);
  expect(result).toMatchObject({ ok: true, value: { id: stored.id } });
  if (result.ok) {
    expect(result.value).not.toHaveProperty('customerId');
    expect(result.value).not.toHaveProperty('requestHash');
  }
  store.findOwned.mockResolvedValueOnce(null);
  expect(await useCase.execute(customerId, stored.id)).toEqual({
    ok: false,
    error: 'TransactionNotFound',
  });
  store.findOwned.mockResolvedValueOnce(stored).mockResolvedValueOnce(null);
  expect(await useCase.execute(customerId, stored.id)).toEqual({
    ok: false,
    error: 'TransactionNotFound',
  });
});
