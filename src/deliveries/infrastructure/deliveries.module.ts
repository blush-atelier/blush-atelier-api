import { Module } from '@nestjs/common';
import { CustomersModule } from '../../customers/infrastructure/customers.module';
import {
  CHECKOUT_RUNTIME,
  type CheckoutRuntime,
} from '../../shared/domain/checkout';
import {
  DELIVERY_REPOSITORY,
  type DeliveryRepository,
} from '../domain/delivery-repository.port';
import { RegisterDelivery } from '../application/register-delivery';
import { TypeOrmDeliveryRepository } from './typeorm-delivery.repository';
import { DeliveriesController } from './deliveries.controller';
@Module({
  imports: [CustomersModule],
  controllers: [DeliveriesController],
  providers: [
    { provide: DELIVERY_REPOSITORY, useClass: TypeOrmDeliveryRepository },
    {
      provide: RegisterDelivery,
      useFactory: (port: DeliveryRepository, runtime: CheckoutRuntime) =>
        new RegisterDelivery(port, runtime),
      inject: [DELIVERY_REPOSITORY, CHECKOUT_RUNTIME],
    },
  ],
})
export class DeliveriesModule {}
