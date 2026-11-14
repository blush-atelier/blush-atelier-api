import type { Result } from '../../shared/domain/result';
import type { Product } from './product';

export const PRODUCT_REPOSITORY = Symbol('PRODUCT_REPOSITORY');
export type ProductReadError = 'ProductStorageUnavailable';
export interface ProductRepository {
  findAll(): Promise<Result<Product[], ProductReadError>>;
  findById(id: string): Promise<Result<Product | null, ProductReadError>>;
}
