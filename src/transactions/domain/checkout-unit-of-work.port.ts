import type { Product } from '../../products/domain/product';
import type { CheckoutResult } from '../../shared/domain/checkout';
import type { Quote } from './pricing';
export const CHECKOUT_UNIT_OF_WORK = Symbol('CHECKOUT_UNIT_OF_WORK');
export interface QuoteInput {
  productId: string;
  quantity: number;
  items?: { productId: string; quantity: number }[];
  deliveryId: string;
}
export interface PendingInput extends QuoteInput {
  expectedTotalMinor: string;
}
export interface StoredTransaction extends Quote {
  id: string;
  reference: string;
  customerId: string;
  deliveryId: string;
  requestHash: string;
  idempotencyKey: string;
  status: 'PENDING' | 'EXPIRED' | 'APPROVED' | 'DECLINED' | 'ERROR';
  reservationStatus: 'ACTIVE' | 'RELEASED' | 'CONFIRMED';
  reservationExpiresAt: string;
}
export interface CheckoutStore {
  lockRequest(customerId: string, key: string): Promise<void>;
  findByKey(customerId: string, key: string): Promise<StoredTransaction | null>;
  findOwned(id: string, customerId: string): Promise<StoredTransaction | null>;
  lockProduct(id: string): Promise<Product | null>;
  releaseExpiredUnstarted(productId: string, now: Date): Promise<void>;
  lockDelivery(id: string, customerId: string): Promise<boolean>;
  deliveryUsed(id: string): Promise<boolean>;
  reserve(productId: string, quantity: number): Promise<boolean>;
  insert(transaction: StoredTransaction): Promise<void>;
}
export interface CheckoutUnitOfWork {
  run<T>(
    work: (store: CheckoutStore) => Promise<CheckoutResult<T>>,
  ): Promise<CheckoutResult<T>>;
}
