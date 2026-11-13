import { ResourceIdDto } from '../../shared/infrastructure/resource-id.dto';
import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import {
  ApiTags,
  ApiHeader,
  ApiCookieAuth,
  ApiCreatedResponse,
} from '@nestjs/swagger';
import { RegisterDelivery } from '../application/register-delivery';
import { DeliveryDto } from './delivery.dto';
import {
  CheckoutCustomer,
  CheckoutSessionGuard,
} from '../../customers/infrastructure/checkout-session.guard';
import { checkoutValue } from '../../shared/infrastructure/checkout-http';
@ApiTags('deliveries')
@ApiCookieAuth('checkout')
@UseGuards(CheckoutSessionGuard)
@Controller('deliveries')
export class DeliveriesController {
  constructor(private readonly register: RegisterDelivery) {}
  @Post()
  @ApiCreatedResponse({ type: ResourceIdDto })
  @ApiHeader({
    name: 'X-Checkout-Request',
    required: true,
    schema: { type: 'string', enum: ['1'], default: '1' },
  })
  create(@CheckoutCustomer() customerId: string, @Body() input: DeliveryDto) {
    return this.register.execute(customerId, input).then(checkoutValue);
  }
}
