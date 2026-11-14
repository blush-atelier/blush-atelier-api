import {
  Catch,
  ExceptionFilter,
  ArgumentsHost,
  HttpException,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';
import type { CheckoutResult, CheckoutError } from '../domain/checkout';
const statusCodes: Record<CheckoutError, number> = {
  InvalidCustomer: 400,
  InvalidDelivery: 400,
  InvalidCheckout: 400,
  SessionRequired: 401,
  DeliveryNotFound: 404,
  ProductNotFound: 404,
  TransactionNotFound: 404,
  InsufficientStock: 409,
  QuoteChanged: 409,
  IdempotencyConflict: 409,
  DeliveryAlreadyUsed: 409,
  AmountOutOfRange: 422,
  CheckoutStorageUnavailable: 503,
};
export class SafeApplicationHttpException extends HttpException {
  constructor(code: string, status: number) {
    super({ code, message: 'No se pudo completar la solicitud.' }, status);
  }
}
export class CheckoutHttpException extends SafeApplicationHttpException {
  constructor(code: CheckoutError) {
    super(code, statusCodes[code]);
  }
}
export function checkoutValue<T>(result: CheckoutResult<T>): T {
  if (!result.ok) throw new CheckoutHttpException(result.error);
  return result.value;
}
@Catch()
export class SafeHttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(SafeHttpExceptionFilter.name);
  catch(error: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const parserType =
      typeof error === 'object' && error !== null && 'type' in error
        ? error.type
        : undefined;
    const status =
      error instanceof HttpException
        ? error.getStatus()
        : parserType === 'entity.parse.failed'
          ? 400
          : parserType === 'entity.too.large'
            ? 413
            : 500;
    if (status >= 500 && status !== 503)
      this.logger.error('HTTP request failed unexpectedly');
    // Ni errores de JSON ni excepciones inesperadas reflejan el cuerpo recibido.
    const body =
      error instanceof SafeApplicationHttpException
        ? error.getResponse()
        : {
            code: status === 400 ? 'InvalidInput' : 'RequestRejected',
            message:
              status >= 500
                ? 'Servicio temporalmente no disponible.'
                : 'Solicitud no permitida o inválida.',
          };
    response.status(status).json(body);
  }
}
