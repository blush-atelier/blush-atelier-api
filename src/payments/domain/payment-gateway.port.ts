import type { Result } from '../../shared/domain/result';

export type PaymentStatus =
  'PENDING' | 'APPROVED' | 'DECLINED' | 'ERROR' | 'VOIDED';

export interface PaymentObservation {
  id: string;
  reference: string;
  amountMinor: string;
  currency: string;
  status: PaymentStatus;
}

export type PaymentProviderError =
  | 'PaymentNotConfigured'
  | 'InvalidPaymentInput'
  | 'PaymentProviderUnavailable'
  | 'PaymentNotFound'
  | 'InvalidProviderResponse';

export interface PaymentGateway {
  // Solo el adaptador consulta al proveedor; un estado enviado por el navegador no es evidencia.
  getPayment(
    id: string,
  ): Promise<Result<PaymentObservation, PaymentProviderError>>;
}
