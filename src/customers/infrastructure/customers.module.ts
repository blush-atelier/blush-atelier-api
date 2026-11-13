import { Module } from '@nestjs/common';
import {
  CUSTOMER_REPOSITORY,
  type CustomerRepository,
} from '../domain/customer-repository.port';
import {
  CHECKOUT_RUNTIME,
  type CheckoutRuntime,
} from '../../shared/domain/checkout';
import { RegisterCustomer } from '../application/register-customer';
import { AuthenticateCheckout } from '../application/authenticate-checkout';
import { TypeOrmCustomerRepository } from './typeorm-customer.repository';
import { CustomersController } from './customers.controller';
import { CheckoutSessionGuard } from './checkout-session.guard';
@Module({
  controllers: [CustomersController],
  providers: [
    { provide: CUSTOMER_REPOSITORY, useClass: TypeOrmCustomerRepository },
    {
      provide: RegisterCustomer,
      useFactory: (port: CustomerRepository, runtime: CheckoutRuntime) =>
        new RegisterCustomer(port, runtime),
      inject: [CUSTOMER_REPOSITORY, CHECKOUT_RUNTIME],
    },
    {
      provide: AuthenticateCheckout,
      useFactory: (port: CustomerRepository, runtime: CheckoutRuntime) =>
        new AuthenticateCheckout(port, runtime),
      inject: [CUSTOMER_REPOSITORY, CHECKOUT_RUNTIME],
    },
    CheckoutSessionGuard,
  ],
  exports: [CheckoutSessionGuard, AuthenticateCheckout],
})
export class CustomersModule {}
