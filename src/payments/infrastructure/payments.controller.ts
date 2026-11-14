import {
  Body,
  Controller,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiCookieAuth,
  ApiHeader,
  ApiOkResponse,
  ApiPropertyOptional,
  ApiProperty,
} from '@nestjs/swagger';
import { IsOptional, Matches, Equals } from 'class-validator';
import {
  CheckoutCustomer,
  CheckoutSessionGuard,
} from '../../customers/infrastructure/checkout-session.guard';
import { SafeApplicationHttpException } from '../../shared/infrastructure/checkout-http';
import type { PaymentResult, PaymentError } from '../domain/payment-ports';
import { PreparePayment } from '../application/prepare-payment';
import {
  VerifyPayment,
  ProcessPaymentEvent,
} from '../application/verify-payment';
const codes: Record<PaymentError, number> = {
  TransactionNotFound: 404,
  CheckoutStorageUnavailable: 503,
  PaymentNotConfigured: 503,
  PaymentSessionExpired: 409,
  InvalidWebhook: 401,
  InvalidPaymentInput: 400,
  InvalidPaymentObservation: 502,
  PaymentIdentityMismatch: 409,
  PaymentAmountMismatch: 409,
  PaymentCurrencyMismatch: 409,
  InvalidPaymentState: 409,
  PaymentProviderUnavailable: 503,
  PaymentNotFound: 404,
  InvalidProviderResponse: 502,
  AmountOutOfRange: 422,
};
export function paymentValue<T>(result: PaymentResult<T>): T {
  if (!result.ok)
    throw new SafeApplicationHttpException(result.error, codes[result.error]);
  return result.value;
}
export class PreparePaymentDto {
  @ApiPropertyOptional({ enum: ['CARD'] })
  @IsOptional()
  @Equals('CARD')
  method?: 'CARD';
}
export class VerifyPaymentDto {
  @ApiPropertyOptional({
    description: 'ID Wompi: solo una pista; el servidor verifica el pago.',
  })
  @IsOptional()
  @Matches(/^[A-Za-z0-9_-]{1,128}$/)
  providerPaymentId?: string;
}
class PaymentSessionResponse {
  @ApiProperty() reference!: string;
  @ApiProperty({ description: 'Centavos exactos como string.' })
  amountMinor!: string;
  @ApiProperty({ enum: ['COP'] }) currency!: string;
  @ApiProperty() publicKey!: string;
  @ApiProperty() integrity!: string;
  @ApiProperty() expiresAt!: string;
}
@ApiTags('payments')
@ApiCookieAuth('checkout')
@ApiHeader({
  name: 'X-Checkout-Request',
  required: true,
  schema: { type: 'string', default: '1' },
})
@UseGuards(CheckoutSessionGuard)
@Controller('transactions')
export class PaymentsController {
  constructor(
    private readonly prepare: PreparePayment,
    private readonly verify: VerifyPayment,
  ) {}
  @Post(':id/payment-session')
  @HttpCode(200)
  @ApiOkResponse({ type: PaymentSessionResponse })
  session(
    @CheckoutCustomer() customerId: string,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() input: PreparePaymentDto,
  ) {
    return this.prepare
      .execute(customerId, id, input.method)
      .then(paymentValue);
  }
  @Post(':id/payment-verification')
  @HttpCode(200)
  verifyPayment(
    @CheckoutCustomer() customerId: string,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() input: VerifyPaymentDto,
  ) {
    return this.verify
      .execute(customerId, id, input.providerPaymentId)
      .then(paymentValue);
  }
}
@ApiTags('payments')
@Controller('payments/wompi')
export class WompiEventsController {
  constructor(private readonly processEvent: ProcessPaymentEvent) {}
  @Post('events')
  @HttpCode(200)
  receive(@Body() input: unknown) {
    return this.processEvent.execute(input).then(paymentValue);
  }
}
