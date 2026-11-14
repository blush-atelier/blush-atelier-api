import { randomUUID } from 'node:crypto';
import { ChargeCard, GetCardConfiguration } from '../application/charge-card';
import {
  Body,
  Get,
  Ip,
  Logger,
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
import {
  IsOptional,
  Matches,
  Equals,
  IsString,
  MaxLength,
  IsInt,
  Min,
  Max,
} from 'class-validator';
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
export class ChargeCardDto {
  @ApiProperty()
  @Matches(/^tok_(?:test_|stagtest)[A-Za-z0-9_-]{1,180}$/)
  token!: string;
  @ApiProperty() @IsString() @MaxLength(4096) acceptanceToken!: string;
  @ApiProperty() @IsString() @MaxLength(4096) personalDataToken!: string;
  @ApiProperty({ minimum: 1, maximum: 36 })
  @IsInt()
  @Min(1)
  @Max(36)
  installments!: number;
  @ApiProperty({ enum: [true] }) @Equals(true) privacyAccepted!: boolean;
  @ApiProperty({ enum: [true] }) @Equals(true) personalDataAccepted!: boolean;
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
    private readonly charge: ChargeCard,
  ) {}
  @Post(':id/payments')
  @HttpCode(200)
  pay(
    @CheckoutCustomer() customerId: string,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() input: ChargeCardDto,
    @Ip() ip: string,
  ) {
    return this.charge
      .execute(
        customerId,
        id,
        input,
        ip === '::1' ? '127.0.0.1' : ip.replace(/^::ffff:/, ''),
      )
      .then(paymentValue);
  }
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
  private readonly logger = new Logger(WompiEventsController.name);
  constructor(private readonly processEvent: ProcessPaymentEvent) {}
  @Post('events')
  @HttpCode(200)
  async receive(@Body() input: unknown) {
    const correlationId = randomUUID();
    const started = performance.now();
    this.logger.log(
      JSON.stringify({ event: 'wompi.webhook.received', correlationId }),
    );
    let result: Awaited<ReturnType<ProcessPaymentEvent['execute']>>;
    try {
      result = await this.processEvent.execute(input);
    } catch {
      // Ni el payload ni la excepción del proveedor/ORM deben llegar al log.
      this.logger.error(
        JSON.stringify({
          event: 'wompi.webhook.failed',
          correlationId,
          durationMs: Math.round(performance.now() - started),
          code: 'UnexpectedFailure',
        }),
      );
      throw new SafeApplicationHttpException('PaymentProviderUnavailable', 503);
    }
    const entry = JSON.stringify({
      event: result.ok ? 'wompi.webhook.processed' : 'wompi.webhook.rejected',
      correlationId,
      durationMs: Math.round(performance.now() - started),
      ...(result.ok
        ? { outcome: result.value.outcome }
        : { code: result.error }),
    });
    if (result.ok) this.logger.log(entry);
    else this.logger.warn(entry);
    paymentValue(result);
    return { received: true };
  }
}

@ApiTags('payments')
@Controller('payments')
export class CardConfigurationController {
  constructor(private readonly configuration: GetCardConfiguration) {}
  @Get('card-configuration')
  @HttpCode(200)
  get() {
    return this.configuration.execute().then(paymentValue);
  }
}
