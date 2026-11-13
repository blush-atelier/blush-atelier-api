import type { CheckoutResult } from '../../shared/domain/checkout';
import type { Customer } from './customer';
export const CUSTOMER_REPOSITORY = Symbol('CUSTOMER_REPOSITORY');
export interface CustomerRepository {
  insert(
    customer: Customer,
    sessionHash: string,
    expiresAt: Date,
  ): Promise<CheckoutResult<void>>;
  findSession(
    hash: string,
  ): Promise<CheckoutResult<{ customerId: string; expiresAt: Date } | null>>;
}
