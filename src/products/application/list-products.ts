import type {
  ProductRepository,
  ProductReadError,
} from '../domain/product-repository.port';
import type { Result } from '../../shared/domain/result';
import { productView } from './product-view';

export class ListProducts {
  constructor(private readonly products: ProductRepository) {}
  async execute(): Promise<
    Result<ReturnType<typeof productView>[], ProductReadError>
  > {
    const result = await this.products.findAll();
    if (!result.ok) return result;
    return { ok: true, value: result.value.map(productView) };
  }
}
