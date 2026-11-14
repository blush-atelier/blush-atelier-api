import { Module } from '@nestjs/common';
import { CustomersModule } from '../../customers/infrastructure/customers.module';
import {
  CHECKOUT_RUNTIME,
  type CheckoutRuntime,
} from '../../shared/domain/checkout';
import {
  PAYMENT_UNIT,
  PAYMENT_GATEWAY,
  PAYMENT_CHECKOUT,
  PAYMENT_EVENTS,
  type PaymentUnitOfWork,
  type PaymentCheckout,
  type PaymentEventVerifier,
} from '../domain/payment-ports';
import type { PaymentGateway } from '../domain/payment-gateway.port';
import { PreparePayment } from '../application/prepare-payment';
import {
  VerifyPayment,
  ProcessPaymentEvent,
} from '../application/verify-payment';
import { TypeOrmPaymentUnitOfWork } from './typeorm-payment.unit-of-work';
import {
  WompiGateway,
  WompiCheckout,
  WompiEvents,
  wompiSettings,
  type WompiSettings,
} from './wompi';
import {
  PaymentsController,
  WompiEventsController,
} from './payments.controller';
const SETTINGS = Symbol('WOMPI_SETTINGS');
@Module({
  imports: [CustomersModule],
  controllers: [PaymentsController, WompiEventsController],
  providers: [
    { provide: SETTINGS, useFactory: () => wompiSettings() },
    { provide: PAYMENT_UNIT, useClass: TypeOrmPaymentUnitOfWork },
    {
      provide: PAYMENT_GATEWAY,
      useFactory: (s: WompiSettings) => new WompiGateway(s),
      inject: [SETTINGS],
    },
    {
      provide: PAYMENT_CHECKOUT,
      useFactory: (s: WompiSettings) => new WompiCheckout(s),
      inject: [SETTINGS],
    },
    {
      provide: PAYMENT_EVENTS,
      useFactory: (s: WompiSettings) => new WompiEvents(s),
      inject: [SETTINGS],
    },
    {
      provide: PreparePayment,
      useFactory: (
        u: PaymentUnitOfWork,
        c: PaymentCheckout,
        r: CheckoutRuntime,
      ) => new PreparePayment(u, c, r),
      inject: [PAYMENT_UNIT, PAYMENT_CHECKOUT, CHECKOUT_RUNTIME],
    },
    {
      provide: VerifyPayment,
      useFactory: (u: PaymentUnitOfWork, g: PaymentGateway) =>
        new VerifyPayment(u, g),
      inject: [PAYMENT_UNIT, PAYMENT_GATEWAY],
    },
    {
      provide: ProcessPaymentEvent,
      useFactory: (
        e: PaymentEventVerifier,
        g: PaymentGateway,
        u: PaymentUnitOfWork,
      ) => new ProcessPaymentEvent(e, g, u),
      inject: [PAYMENT_EVENTS, PAYMENT_GATEWAY, PAYMENT_UNIT],
    },
  ],
})
export class PaymentsModule {}
