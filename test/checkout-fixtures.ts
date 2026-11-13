import type { CheckoutRuntime } from '../src/shared/domain/checkout';
import type {
  CheckoutStore,
  CheckoutUnitOfWork,
  StoredTransaction,
} from '../src/transactions/domain/checkout-unit-of-work.port';
import { product, productData } from './fixtures';
export const customerInput = {
  fullName: ' Ana Prueba ',
  email: ' ANA@EXAMPLE.COM ',
  phone: '+57 300 1234567',
};
export const deliveryInput = {
  recipientName: ' Ana Prueba ',
  recipientPhone: '+57 300 1234567',
  addressLine: ' Calle 10 # 20-30 ',
  city: ' Bogotá ',
  region: ' Bogotá D.C. ',
  countryCode: 'CO',
};
export const customerId = '33333333-3333-4333-8333-333333333333';
export const deliveryId = '44444444-4444-4444-8444-444444444444';
export const transactionId = '55555555-5555-4555-8555-555555555555';
export const fees = { baseFeeMinor: 500000n, deliveryFeeMinor: 1000000n };
export const quoteInput = {
  productId: productData.id,
  quantity: 1,
  deliveryId,
};
export const pendingInput = { ...quoteInput, expectedTotalMinor: '10490000' };
export const runtime: CheckoutRuntime = {
  id: () => transactionId,
  token: () => 'a'.repeat(64),
  hash: (value) => `hash:${value}`,
  now: () => new Date('2026-11-13T12:00:00Z'),
};
export const stored: StoredTransaction = {
  ...pendingInput,
  id: transactionId,
  reference: `BA-${transactionId}`,
  customerId,
  idempotencyKey: 'request-0001',
  requestHash: 'hash',
  currency: 'COP',
  unitPriceMinor: '8990000',
  productAmountMinor: '8990000',
  baseFeeMinor: '500000',
  deliveryFeeMinor: '1000000',
  totalMinor: '10490000',
  status: 'PENDING',
  reservationStatus: 'ACTIVE',
  reservationExpiresAt: '2026-11-13T12:15:00.000Z',
};
export function storeFixture(): jest.Mocked<CheckoutStore> {
  return {
    lockRequest: jest.fn().mockResolvedValue(undefined),
    findByKey: jest.fn().mockResolvedValue(null),
    findOwned: jest.fn().mockResolvedValue(stored),
    lockProduct: jest.fn().mockResolvedValue(product({ stockReserved: 0 })),
    releaseExpiredUnstarted: jest.fn().mockResolvedValue(undefined),
    lockDelivery: jest.fn().mockResolvedValue(true),
    deliveryUsed: jest.fn().mockResolvedValue(false),
    reserve: jest.fn().mockResolvedValue(true),
    insert: jest.fn().mockResolvedValue(undefined),
  };
}
export function unitFixture(store: CheckoutStore): CheckoutUnitOfWork {
  return { run: (work) => work(store) };
}
