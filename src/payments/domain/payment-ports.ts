import type { Result } from '../../shared/domain/result';
import type {
  PaymentOrder,
  PaymentDecision,
  PaymentTransitionError,
} from './payment-transition';
import type {
  PaymentObservation,
  PaymentProviderError,
} from './payment-gateway.port';
export type PaymentError =
  | PaymentTransitionError
  | PaymentProviderError
  | 'TransactionNotFound'
  | 'CheckoutStorageUnavailable'
  | 'PaymentNotConfigured'
  | 'PaymentSessionExpired'
  | 'InvalidWebhook'
  | 'InvalidPaymentInput'
  | 'AmountOutOfRange';
export type PaymentResult<T> = Result<T, PaymentError>;
export interface PaymentRecord extends PaymentOrder {
  id: string;
  customerId: string;
  deliveryId: string;
  reservationExpiresAt: string;
  paymentStartedAt: string | null;
  paymentSubmittedAt: string | null;
  customerEmail: string;
  paymentExpiresAt: string | null;
}
export interface PaymentStore {
  find(id: string, customerId: string): Promise<PaymentRecord | null>;
  findByReference(reference: string): Promise<PaymentRecord | null>;
  start(id: string, now: Date, expiresAt: string): Promise<void>;
  claimSubmission(id: string, now: Date, expiresAt: string): Promise<void>;
  apply(
    record: PaymentRecord,
    observation: PaymentObservation,
    decision: PaymentDecision,
  ): Promise<void>;
}
export interface PaymentUnitOfWork {
  run<T>(
    work: (store: PaymentStore) => Promise<PaymentResult<T>>,
  ): Promise<PaymentResult<T>>;
}
export interface PaymentSession {
  reference: string;
  amountMinor: string;
  currency: 'COP';
  publicKey: string;
  integrity: string;
  expiresAt: string;
}
export interface PaymentCheckout {
  create(
    reference: string,
    amountMinor: string,
    expiresAt: string,
  ): PaymentResult<PaymentSession>;
}
export interface PaymentEventVerifier {
  verify(body: unknown): PaymentResult<{ providerPaymentId: string }>;
}
export const PAYMENT_UNIT = Symbol('PAYMENT_UNIT');
export const PAYMENT_GATEWAY = Symbol('PAYMENT_GATEWAY');
export const PAYMENT_CHECKOUT = Symbol('PAYMENT_CHECKOUT');
export const PAYMENT_EVENTS = Symbol('PAYMENT_EVENTS');
