import { createDelivery, type DeliveryInput } from '../domain/delivery';
import type { DeliveryRepository } from '../domain/delivery-repository.port';
import type {
  CheckoutResult,
  CheckoutRuntime,
} from '../../shared/domain/checkout';
export class RegisterDelivery {
  constructor(
    private readonly deliveries: DeliveryRepository,
    private readonly runtime: CheckoutRuntime,
  ) {}
  async execute(
    customerId: string,
    input: DeliveryInput,
  ): Promise<CheckoutResult<{ id: string }>> {
    const delivery = createDelivery(this.runtime.id(), customerId, input);
    if (!delivery.ok) return delivery;
    const saved = await this.deliveries.insert(delivery.value);
    if (!saved.ok) return saved;
    return { ok: true, value: { id: delivery.value.id } };
  }
}
