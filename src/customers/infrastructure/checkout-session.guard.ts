import {
  Injectable,
  CanActivate,
  ExecutionContext,
  createParamDecorator,
} from '@nestjs/common';
import type { Request } from 'express';
import { AuthenticateCheckout } from '../application/authenticate-checkout';
import { checkoutValue } from '../../shared/infrastructure/checkout-http';
export type CheckoutRequest = Request & { checkoutCustomerId: string };
export const CheckoutCustomer = createParamDecorator(
  (_data: unknown, context: ExecutionContext) =>
    context.switchToHttp().getRequest<CheckoutRequest>().checkoutCustomerId,
);
@Injectable()
export class CheckoutSessionGuard implements CanActivate {
  constructor(private readonly authenticate: AuthenticateCheckout) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<CheckoutRequest>();
    const token =
      /(?:^|;\s*)checkout_session=([a-f0-9]{64})(?:;|$)/.exec(
        request.headers.cookie || '',
      )?.[1] || '';
    request.checkoutCustomerId = checkoutValue(
      await this.authenticate.execute(token),
    );
    return true;
  }
}
