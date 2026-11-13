import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Product } from '../domain/product';
import type {
  ProductRepository,
  ProductReadError,
} from '../domain/product-repository.port';
import type { Result } from '../../shared/domain/result';
import { ProductOrmEntity } from './product.orm-entity';

@Injectable()
export class TypeOrmProductRepository implements ProductRepository {
  private readonly logger = new Logger(TypeOrmProductRepository.name);
  constructor(
    @InjectRepository(ProductOrmEntity)
    private readonly repository: Repository<ProductOrmEntity>,
  ) {}

  private map(row: ProductOrmEntity): Product {
    const result = Product.create({
      id: row.id,
      sku: row.sku,
      name: row.name,
      description: row.description,
      imageUrl: row.imageUrl,
      priceMinor: BigInt(row.priceMinor),
      currency: row.currency,
      stockOnHand: row.stockOnHand,
      stockReserved: row.stockReserved,
    });
    if (!result.ok) throw new Error('Invalid persisted product');
    return result.value;
  }

  async findAll(): Promise<Result<Product[], ProductReadError>> {
    try {
      const rows = await this.repository.find({ order: { sku: 'ASC' } });
      return { ok: true, value: rows.map((row) => this.map(row)) };
    } catch {
      // No registramos la consulta ni el error del driver: pueden contener credenciales.
      this.logger.error('Product listing unavailable');
      return { ok: false, error: 'ProductStorageUnavailable' };
    }
  }

  async findById(
    id: string,
  ): Promise<Result<Product | null, ProductReadError>> {
    try {
      const row = await this.repository.findOneBy({ id });
      return { ok: true, value: row ? this.map(row) : null };
    } catch {
      this.logger.error('Product lookup unavailable');
      return { ok: false, error: 'ProductStorageUnavailable' };
    }
  }
}
