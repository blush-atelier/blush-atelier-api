import { Module } from '@nestjs/common';
import { CustomersModule } from '../../customers/infrastructure/customers.module';
import {
  CHECKOUT_RUNTIME,
  type CheckoutRuntime,
  MAX_MONEY,
} from '../../shared/domain/checkout';
import { CHECKOUT_FEES, type CheckoutFees } from '../domain/pricing';
import {
  CHECKOUT_UNIT_OF_WORK,
  type CheckoutUnitOfWork,
} from '../domain/checkout-unit-of-work.port';
import { QuoteCheckout } from '../application/quote-checkout';
import { CreatePendingTransaction } from '../application/create-pending-transaction';
import { GetTransaction } from '../application/get-transaction';
import { TypeOrmCheckoutUnitOfWork } from './typeorm-checkout.unit-of-work';
import {
  CheckoutController,
  TransactionsController,
} from './transactions.controller';
export function checkoutFees(
  env: NodeJS.ProcessEnv = process.env,
): CheckoutFees {
  if (
    env.NODE_ENV === 'production' &&
    (!env.BASE_FEE_MINOR?.trim() || !env.DELIVERY_FEE_MINOR?.trim())
  )
    throw new Error('Configure production checkout fees');
  const base = env.BASE_FEE_MINOR?.trim() || '500000';
  const delivery = env.DELIVERY_FEE_MINOR?.trim() || '1000000';
  if (
    !/^[0-9]{1,19}$/.test(base) ||
    !/^[0-9]{1,19}$/.test(delivery) ||
    BigInt(base) <= 0n ||
    BigInt(base) + BigInt(delivery) > MAX_MONEY
  )
    throw new Error('Invalid checkout fees');
  return { baseFeeMinor: BigInt(base), deliveryFeeMinor: BigInt(delivery) };
}
@Module({
  imports: [CustomersModule],
  controllers: [CheckoutController, TransactionsController],
  providers: [
    { provide: CHECKOUT_FEES, useFactory: () => checkoutFees() },
    { provide: CHECKOUT_UNIT_OF_WORK, useClass: TypeOrmCheckoutUnitOfWork },
    {
      provide: QuoteCheckout,
      useFactory: (
        unit: CheckoutUnitOfWork,
        fees: CheckoutFees,
        runtime: CheckoutRuntime,
      ) => new QuoteCheckout(unit, fees, runtime),
      inject: [CHECKOUT_UNIT_OF_WORK, CHECKOUT_FEES, CHECKOUT_RUNTIME],
    },
    {
      provide: CreatePendingTransaction,
      useFactory: (
        unit: CheckoutUnitOfWork,
        fees: CheckoutFees,
        runtime: CheckoutRuntime,
      ) => new CreatePendingTransaction(unit, fees, runtime),
      inject: [CHECKOUT_UNIT_OF_WORK, CHECKOUT_FEES, CHECKOUT_RUNTIME],
    },
    {
      provide: GetTransaction,
      useFactory: (unit: CheckoutUnitOfWork, runtime: CheckoutRuntime) =>
        new GetTransaction(unit, runtime),
      inject: [CHECKOUT_UNIT_OF_WORK, CHECKOUT_RUNTIME],
    },
  ],
})
export class TransactionsModule {}
