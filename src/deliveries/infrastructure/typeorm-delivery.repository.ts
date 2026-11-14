import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { DeliveryRepository } from '../domain/delivery-repository.port';
import type { Delivery } from '../domain/delivery';
import type { CheckoutResult } from '../../shared/domain/checkout';
import { DeliveryOrmEntity } from './delivery.orm-entity';
@Injectable()
export class TypeOrmDeliveryRepository implements DeliveryRepository {
  private readonly logger = new Logger(TypeOrmDeliveryRepository.name);
  constructor(private readonly source: DataSource) {}
  async insert(delivery: Delivery): Promise<CheckoutResult<void>> {
    try {
      await this.source.getRepository(DeliveryOrmEntity).insert({
        id: delivery.id,
        customerId: delivery.customerId,
        recipientName: delivery.recipientName,
        recipientPhone: delivery.recipientPhone,
        addressLine: delivery.addressLine,
        city: delivery.city,
        region: delivery.region,
        countryCode: delivery.countryCode,
      });
      return { ok: true, value: undefined };
    } catch {
      this.logger.error('Delivery registration unavailable');
      return { ok: false, error: 'CheckoutStorageUnavailable' };
    }
  }
}
