import { createCustomer, type CustomerInput } from '../domain/customer';
import type { CustomerRepository } from '../domain/customer-repository.port';
import type {
  CheckoutResult,
  CheckoutRuntime,
} from '../../shared/domain/checkout';
export class RegisterCustomer {
  constructor(
    private readonly customers: CustomerRepository,
    private readonly runtime: CheckoutRuntime,
  ) {}
  async execute(
    input: CustomerInput,
  ): Promise<CheckoutResult<{ id: string; sessionToken: string }>> {
    const customer = createCustomer(this.runtime.id(), input);
    if (!customer.ok) return customer;
    const sessionToken = this.runtime.token();
    const saved = await this.customers.insert(
      customer.value,
      this.runtime.hash(sessionToken),
      new Date(this.runtime.now().getTime() + 3600000),
    );
    if (!saved.ok) return saved;
    return { ok: true, value: { id: customer.value.id, sessionToken } };
  }
}
