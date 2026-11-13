import type {
  ProductRepository,
  ProductReadError,
} from '../domain/product-repository.port';
import type { Result } from '../../shared/domain/result';
import { productView } from './product-view';

export class GetProduct {
  constructor(private readonly products: ProductRepository) {}
  async execute(
    id: string,
  ): Promise<
    Result<ReturnType<typeof productView>, ProductReadError | 'ProductNotFound'>
  > {
    const result = await this.products.findById(id);
    if (!result.ok) return result;
    if (!result.value) return { ok: false, error: 'ProductNotFound' };
    return { ok: true, value: productView(result.value) };
  }
}
