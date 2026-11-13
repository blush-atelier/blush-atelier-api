import type { Result } from '../../shared/domain/result';

export interface ProductData {
  readonly id: string;
  readonly sku: string;
  readonly name: string;
  readonly description: string;
  readonly imageUrl: string | null;
  readonly priceMinor: bigint;
  readonly currency: 'COP';
  readonly stockOnHand: number;
  readonly stockReserved: number;
}

export class Product {
  private constructor(readonly data: Readonly<ProductData>) {}

  static create(data: ProductData): Result<Product, 'InvalidProduct'> {
    if (
      !data.id ||
      !data.sku.trim() ||
      !data.name.trim() ||
      data.priceMinor < 0n ||
      data.priceMinor > 9223372036854775807n ||
      data.currency !== 'COP' ||
      !Number.isSafeInteger(data.stockOnHand) ||
      !Number.isSafeInteger(data.stockReserved) ||
      data.stockOnHand > 2147483647 ||
      data.stockOnHand < 0 ||
      data.stockReserved < 0 ||
      data.stockReserved > data.stockOnHand
    )
      return { ok: false, error: 'InvalidProduct' };
    return { ok: true, value: new Product(Object.freeze({ ...data })) };
  }

  get availableStock(): number {
    return this.data.stockOnHand - this.data.stockReserved;
  }
}
