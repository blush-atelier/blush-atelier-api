import { Injectable, Logger } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { Product } from '../../products/domain/product';
import type { CheckoutResult } from '../../shared/domain/checkout';
import type {
  CheckoutUnitOfWork,
  CheckoutStore,
  StoredTransaction,
} from '../domain/checkout-unit-of-work.port';
import { TransactionOrmEntity } from './transaction.orm-entity';
import { ProductOrmEntity } from '../../products/infrastructure/product.orm-entity';

class RollbackResult {
  constructor(readonly result: CheckoutResult<never>) {}
}
class PostgresCheckoutStore implements CheckoutStore {
  constructor(private readonly manager: EntityManager) {}
  async lockRequest(customerId: string, key: string): Promise<void> {
    await this.manager.query(
      'SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))',
      [customerId, key],
    );
  }
  private async read(
    where: string,
    values: string[],
  ): Promise<StoredTransaction | null> {
    const rows: TransactionOrmEntity[] = await this.manager
      .getRepository(TransactionOrmEntity)
      .createQueryBuilder('transaction')
      .where(where, { first: values[0], second: values[1] })
      .getMany();
    const row = rows[0];
    if (!row) return null;
    return {
      id: row.id,
      reference: row.reference,
      customerId: row.customerId,
      deliveryId: row.deliveryId,
      productId: row.productId,
      quantity: row.quantity,
      unitPriceMinor: row.unitPriceMinor,
      productAmountMinor: row.productAmountMinor,
      baseFeeMinor: row.baseFeeMinor,
      deliveryFeeMinor: row.deliveryFeeMinor,
      totalMinor: row.totalMinor,
      currency: 'COP',
      status: row.status as StoredTransaction['status'],
      reservationStatus:
        row.reservationStatus as StoredTransaction['reservationStatus'],
      reservationExpiresAt: row.reservationExpiresAt.toISOString(),
      idempotencyKey: row.idempotencyKey,
      requestHash: row.requestHash,
    };
  }
  findByKey(customerId: string, key: string) {
    return this.read(
      'transaction.customer_id = :first AND transaction.idempotency_key = :second',
      [customerId, key],
    );
  }
  findOwned(id: string, customerId: string) {
    return this.read(
      'transaction.id = :first AND transaction.customer_id = :second',
      [id, customerId],
    );
  }
  async lockProduct(id: string): Promise<Product | null> {
    const row = await this.manager
      .getRepository(ProductOrmEntity)
      .createQueryBuilder('product')
      .setLock('pessimistic_write')
      .where('product.id = :id', { id })
      .getOne();
    if (!row) return null;
    const product = Product.create({
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
    if (!product.ok) throw new Error('Invalid stored product');
    return product.value;
  }
  async releaseExpiredUnstarted(productId: string, now: Date): Promise<void> {
    // El producto ya está bloqueado. Cambiar estado y liberar sus unidades es una sola operación SQL.
    await this.manager.query(
      `WITH released AS (
   UPDATE transactions SET status='EXPIRED', reservation_status='RELEASED', updated_at=$2
   WHERE product_id=$1 AND status='PENDING' AND reservation_status='ACTIVE'
     AND payment_started_at IS NULL AND reservation_expires_at <= $2 RETURNING quantity
  ) UPDATE products SET stock_reserved=stock_reserved-COALESCE((SELECT sum(quantity) FROM released),0)::integer, updated_at=$2 WHERE id=$1`,
      [productId, now],
    );
  }
  async lockDelivery(id: string, customerId: string): Promise<boolean> {
    const rows: { id: string }[] = await this.manager.query(
      'SELECT id FROM deliveries WHERE id=$1 AND customer_id=$2 FOR UPDATE',
      [id, customerId],
    );
    return rows.length > 0;
  }
  async deliveryUsed(id: string): Promise<boolean> {
    const rows: { id: string }[] = await this.manager.query(
      'SELECT id FROM transactions WHERE delivery_id=$1',
      [id],
    );
    return rows.length > 0;
  }
  async reserve(productId: string, quantity: number): Promise<boolean> {
    const rows: [unknown[], number] = await this.manager.query(
      'UPDATE products SET stock_reserved=stock_reserved+$2, updated_at=now() WHERE id=$1 AND stock_on_hand-stock_reserved >= $2 RETURNING id',
      [productId, quantity],
    );
    return rows[1] === 1;
  }
  async insert(transaction: StoredTransaction): Promise<void> {
    await this.manager.getRepository(TransactionOrmEntity).insert({
      ...transaction,
      reservationExpiresAt: new Date(transaction.reservationExpiresAt),
    });
  }
}
@Injectable()
export class TypeOrmCheckoutUnitOfWork implements CheckoutUnitOfWork {
  private readonly logger = new Logger(TypeOrmCheckoutUnitOfWork.name);
  constructor(private readonly source: DataSource) {}
  async run<T>(
    work: (store: CheckoutStore) => Promise<CheckoutResult<T>>,
  ): Promise<CheckoutResult<T>> {
    try {
      return await this.source.transaction(async (manager) => {
        const result = await work(new PostgresCheckoutStore(manager));
        // TypeORM necesita una excepción interna para revertir también un Result fallido.
        if (!result.ok) throw new RollbackResult(result);
        return result;
      });
    } catch (error) {
      if (error instanceof RollbackResult) return error.result;
      this.logger.error('Checkout transaction unavailable');
      return { ok: false, error: 'CheckoutStorageUnavailable' };
    }
  }
}
