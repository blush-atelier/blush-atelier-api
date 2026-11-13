import type { CustomerRepository } from '../domain/customer-repository.port';
import type {
  CheckoutResult,
  CheckoutRuntime,
} from '../../shared/domain/checkout';
export class AuthenticateCheckout {
  constructor(
    private readonly customers: CustomerRepository,
    private readonly runtime: CheckoutRuntime,
  ) {}
  async execute(token: string): Promise<CheckoutResult<string>> {
    if (!/^[a-f0-9]{64}$/.test(token))
      return { ok: false, error: 'SessionRequired' };
    const result = await this.customers.findSession(this.runtime.hash(token));
    if (!result.ok) return result;
    if (!result.value || result.value.expiresAt <= this.runtime.now())
      return { ok: false, error: 'SessionRequired' };
    return { ok: true, value: result.value.customerId };
  }
}
