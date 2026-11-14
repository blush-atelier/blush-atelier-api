import type {
  PaymentObservation,
  PaymentProviderError,
} from './payment-gateway.port';
import type { Result } from '../../shared/domain/result';
export interface CardConfiguration {
  apiUrl: string;
  publicKey: string;
  encryptionKey: string;
  privacyUrl: string;
  personalDataUrl: string;
  acceptanceToken: string;
  personalDataToken: string;
}
export interface CardAuthorization {
  token: string;
  acceptanceToken: string;
  personalDataToken: string;
  installments: number;
  privacyAccepted: boolean;
  personalDataAccepted: boolean;
}
export interface CardChargeRequest extends CardAuthorization {
  reference: string;
  amountMinor: string;
  customerEmail: string;
  clientIp: string;
}
export type CardGatewayResult<T> = Result<
  T,
  PaymentProviderError | 'AmountOutOfRange'
>;
export interface CardPaymentsGateway {
  readonly enabled: boolean;
  configuration(): Promise<CardGatewayResult<CardConfiguration>>;
  charge(
    input: CardChargeRequest,
  ): Promise<CardGatewayResult<PaymentObservation>>;
}
export const CARD_PAYMENTS = Symbol('CARD_PAYMENTS');
