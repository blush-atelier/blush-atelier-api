import { PaymentsModule } from '../payments/infrastructure/payments.module';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { CustomersModule } from '../customers/infrastructure/customers.module';
import { DeliveriesModule } from '../deliveries/infrastructure/deliveries.module';
import { TransactionsModule } from '../transactions/infrastructure/transactions.module';
import { CheckoutRuntimeModule } from '../shared/infrastructure/checkout-runtime';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProductsModule } from '../products/infrastructure/products.module';
import { databaseOptions } from '../shared/infrastructure/database/database-options';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({ useFactory: () => databaseOptions() }),
    ProductsModule,
    CheckoutRuntimeModule,
    CustomersModule,
    DeliveriesModule,
    TransactionsModule,
    PaymentsModule,
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 60 }]),
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
