import { Global, Module } from '@nestjs/common';
import { randomUUID, randomBytes, createHash } from 'node:crypto';
import { CHECKOUT_RUNTIME, type CheckoutRuntime } from '../domain/checkout';
export class NodeCheckoutRuntime implements CheckoutRuntime {
  id(): string {
    return randomUUID();
  }
  token(): string {
    return randomBytes(32).toString('hex');
  }
  hash(value: string): string {
    return createHash('sha256').update(value).digest('hex');
  }
  now(): Date {
    return new Date();
  }
}
@Global()
@Module({
  providers: [{ provide: CHECKOUT_RUNTIME, useClass: NodeCheckoutRuntime }],
  exports: [CHECKOUT_RUNTIME],
})
export class CheckoutRuntimeModule {}
