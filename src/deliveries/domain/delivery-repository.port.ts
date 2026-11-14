import type { CheckoutResult } from '../../shared/domain/checkout';
import type { Delivery } from './delivery';
export const DELIVERY_REPOSITORY = Symbol('DELIVERY_REPOSITORY');
export interface DeliveryRepository {
  insert(delivery: Delivery): Promise<CheckoutResult<void>>;
}
