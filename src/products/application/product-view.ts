import type { Product } from '../domain/product';

export function productView(product: Product) {
  return {
    id: product.data.id,
    sku: product.data.sku,
    name: product.data.name,
    description: product.data.description,
    imageUrl: product.data.imageUrl,
    // JSON no admite bigint; los centavos se transmiten sin convertirlos a Number.
    priceMinor: product.data.priceMinor.toString(),
    currency: product.data.currency,
    availableStock: product.availableStock,
  };
}
