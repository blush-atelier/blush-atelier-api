import { ResourceIdDto } from '../../shared/infrastructure/resource-id.dto';
import { Controller, Post, Body, Res } from '@nestjs/common';
import { ApiTags, ApiHeader, ApiOperation, ApiResponse } from '@nestjs/swagger';
import type { Response } from 'express';
import { RegisterCustomer } from '../application/register-customer';
import { CustomerDto } from './customer.dto';
import { checkoutValue } from '../../shared/infrastructure/checkout-http';
@ApiTags('customers')
@Controller('customers')
export class CustomersController {
  constructor(private readonly register: RegisterCustomer) {}
  @Post()
  @ApiHeader({
    name: 'X-Checkout-Request',
    required: true,
    schema: { type: 'string', enum: ['1'], default: '1' },
  })
  @ApiOperation({
    summary:
      'Registrar comprador e iniciar sesión de checkout (cookie HttpOnly)',
  })
  @ApiResponse({
    status: 201,
    type: ResourceIdDto,
    description: 'Devuelve id; guarda la sesión en cookie, no en JSON.',
  })
  async create(
    @Body() input: CustomerDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = checkoutValue(await this.register.execute(input));
    response.cookie('checkout_session', result.sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
      path: '/api',
      maxAge: 3600000,
    });
    return { id: result.id };
  }
}
