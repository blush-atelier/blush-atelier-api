import { MAX_MONEY, type CheckoutResult } from '../../shared/domain/checkout';
import type { Product } from '../../products/domain/product';
export const CHECKOUT_FEES = Symbol('CHECKOUT_FEES');
export interface CheckoutFees {
  baseFeeMinor: bigint;
  deliveryFeeMinor: bigint;
}
export interface Quote {
  productId: string;
  quantity: number;
  currency: 'COP';
  unitPriceMinor: string;
  productAmountMinor: string;
  baseFeeMinor: string;
  deliveryFeeMinor: string;
  totalMinor: string;
}
export function calculateQuote(
  product: Product,
  quantity: number,
  fees: CheckoutFees,
): CheckoutResult<Quote> {
  if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 2147483647)
    return { ok: false, error: 'InvalidCheckout' };
  if (quantity > product.availableStock)
    return { ok: false, error: 'InsufficientStock' };
  if (fees.baseFeeMinor <= 0n || fees.deliveryFeeMinor < 0n)
    return { ok: false, error: 'InvalidCheckout' };
  const amount = product.data.priceMinor * BigInt(quantity);
  const total = amount + fees.baseFeeMinor + fees.deliveryFeeMinor;
  if (total > MAX_MONEY) return { ok: false, error: 'AmountOutOfRange' };
  return {
    ok: true,
    value: {
      productId: product.data.id,
      quantity,
      currency: 'COP',
      unitPriceMinor: product.data.priceMinor.toString(),
      productAmountMinor: amount.toString(),
      baseFeeMinor: fees.baseFeeMinor.toString(),
      deliveryFeeMinor: fees.deliveryFeeMinor.toString(),
      totalMinor: total.toString(),
    },
  };
}
