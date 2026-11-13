import {
  QuoteResponseDto,
  TransactionResponseDto,
} from './checkout-response.dto';
import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Headers,
  ParseUUIDPipe,
  UseGuards,
  HttpCode,
} from '@nestjs/common';
import {
  ApiTags,
  ApiHeader,
  ApiCookieAuth,
  ApiOkResponse,
  ApiCreatedResponse,
  ApiResponse,
} from '@nestjs/swagger';
import { QuoteCheckout } from '../application/quote-checkout';
import { CreatePendingTransaction } from '../application/create-pending-transaction';
import { GetTransaction } from '../application/get-transaction';
import { QuoteDto, PendingDto } from './checkout.dto';
import {
  CheckoutCustomer,
  CheckoutSessionGuard,
} from '../../customers/infrastructure/checkout-session.guard';
import { checkoutValue } from '../../shared/infrastructure/checkout-http';
@ApiTags('checkout')
@ApiCookieAuth('checkout')
@UseGuards(CheckoutSessionGuard)
@Controller('checkout')
export class CheckoutController {
  constructor(private readonly quote: QuoteCheckout) {}
  @Post('quote')
  @HttpCode(200)
  @ApiOkResponse({ type: QuoteResponseDto })
  @ApiResponse({ status: 401, description: 'Sesión requerida o vencida.' })
  @ApiResponse({ status: 409, description: 'Stock insuficiente.' })
  @ApiHeader({
    name: 'X-Checkout-Request',
    required: true,
    schema: { type: 'string', enum: ['1'], default: '1' },
  })
  create(@CheckoutCustomer() customerId: string, @Body() input: QuoteDto) {
    return this.quote.execute(customerId, input).then(checkoutValue);
  }
}
@ApiTags('transactions')
@ApiCookieAuth('checkout')
@UseGuards(CheckoutSessionGuard)
@Controller('transactions')
export class TransactionsController {
  constructor(
    private readonly createPending: CreatePendingTransaction,
    private readonly getTransaction: GetTransaction,
  ) {}
  @Post()
  @ApiCreatedResponse({ type: TransactionResponseDto })
  @ApiResponse({
    status: 409,
    description:
      'QuoteChanged, IdempotencyConflict, InsufficientStock o DeliveryAlreadyUsed.',
  })
  @ApiHeader({
    name: 'X-Checkout-Request',
    required: true,
    schema: { type: 'string', enum: ['1'], default: '1' },
  })
  @ApiHeader({
    name: 'Idempotency-Key',
    required: true,
    schema: {
      type: 'string',
      example: 'checkout-request-0001',
      minLength: 8,
      maxLength: 128,
    },
  })
  create(
    @CheckoutCustomer() customerId: string,
    @Headers('idempotency-key') key: string | undefined,
    @Body() input: PendingDto,
  ) {
    return this.createPending
      .execute(customerId, key || '', input)
      .then(checkoutValue);
  }
  @Get(':id')
  @ApiOkResponse({ type: TransactionResponseDto })
  @ApiResponse({
    status: 404,
    description: 'La transacción no existe en esta sesión.',
  })
  get(
    @CheckoutCustomer() customerId: string,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    return this.getTransaction.execute(customerId, id).then(checkoutValue);
  }
}
