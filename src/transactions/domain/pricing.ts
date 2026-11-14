import { MAX_MONEY, type CheckoutResult } from '../../shared/domain/checkout';
import type { Product } from '../../products/domain/product';
export const CHECKOUT_FEES = Symbol('CHECKOUT_FEES');
export interface CheckoutFees {
  baseFeeMinor: bigint;
  deliveryFeeMinor: bigint;
}
export interface QuoteItem {
  productId: string;
  quantity: number;
  unitPriceMinor: string;
  productAmountMinor: string;
}
export interface Quote {
  items?: QuoteItem[];
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

// Las tarifas se suman una sola vez por pedido, siempre con aritmética entera.
export function calculateBasket(
  products: Product[],
  quantities: number[],
  fees: CheckoutFees,
): CheckoutResult<Quote> {
  if (
    !products.length ||
    products.length > 50 ||
    new Set(products.map((p) => p.data.id)).size !== products.length
  )
    return { ok: false, error: 'InvalidCheckout' };
  const items: QuoteItem[] = [];
  for (let i = 0; i < products.length; i++) {
    const result = calculateQuote(products[i], quantities[i], fees);
    if (!result.ok) return result;
    const { productId, quantity, unitPriceMinor, productAmountMinor } =
      result.value;
    items.push({ productId, quantity, unitPriceMinor, productAmountMinor });
  }
  const amount = items.reduce(
    (sum, item) => sum + BigInt(item.productAmountMinor),
    0n,
  );
  const total = amount + fees.baseFeeMinor + fees.deliveryFeeMinor;
  if (total > MAX_MONEY) return { ok: false, error: 'AmountOutOfRange' };
  return {
    ok: true,
    value: {
      ...items[0],
      ...(items.length > 1 ? { items } : {}),
      currency: 'COP',
      productAmountMinor: amount.toString(),
      baseFeeMinor: fees.baseFeeMinor.toString(),
      deliveryFeeMinor: fees.deliveryFeeMinor.toString(),
      totalMinor: total.toString(),
    },
  };
}
