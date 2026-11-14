import type { Result } from './result';
export type CheckoutError =
  | 'InvalidCustomer'
  | 'InvalidDelivery'
  | 'InvalidCheckout'
  | 'SessionRequired'
  | 'DeliveryNotFound'
  | 'ProductNotFound'
  | 'InsufficientStock'
  | 'QuoteChanged'
  | 'IdempotencyConflict'
  | 'DeliveryAlreadyUsed'
  | 'CheckoutStorageUnavailable'
  | 'TransactionNotFound'
  | 'AmountOutOfRange';
export type CheckoutResult<T> = Result<T, CheckoutError>;
export const CHECKOUT_RUNTIME = Symbol('CHECKOUT_RUNTIME');
export interface CheckoutRuntime {
  id(): string;
  token(): string;
  hash(value: string): string;
  now(): Date;
}
export const MAX_MONEY = 9223372036854775807n;
export function validText(value: string, min: number, max: number): boolean {
  return (
    typeof value === 'string' &&
    value.trim().length >= min &&
    value.trim().length <= max &&
    !/\p{Cc}/u.test(value)
  );
}
export function validPhone(value: string): boolean {
  return /^\+?[0-9]{7,15}$/.test(value);
}
