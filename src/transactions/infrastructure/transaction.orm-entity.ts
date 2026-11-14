import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
@Entity('transactions')
export class TransactionOrmEntity {
  @PrimaryColumn('uuid') id!: string;
  @Column({ type: 'varchar', length: 50, unique: true }) reference!: string;
  @Column({ name: 'customer_id', type: 'uuid' }) customerId!: string;
  @Column({ name: 'delivery_id', type: 'uuid', unique: true })
  deliveryId!: string;
  @Column({ name: 'product_id', type: 'uuid' }) productId!: string;
  @Column({ name: 'idempotency_key', type: 'varchar', length: 128 })
  idempotencyKey!: string;
  @Column({ name: 'request_hash', type: 'char', length: 64 })
  requestHash!: string;
  @Column('integer') quantity!: number;
  @Column({ name: 'unit_price_minor', type: 'bigint' }) unitPriceMinor!: string;
  @Column({ name: 'product_amount_minor', type: 'bigint' })
  productAmountMinor!: string;
  @Column({ name: 'base_fee_minor', type: 'bigint' }) baseFeeMinor!: string;
  @Column({ name: 'delivery_fee_minor', type: 'bigint' })
  deliveryFeeMinor!: string;
  @Column({ name: 'total_minor', type: 'bigint' }) totalMinor!: string;
  @Column({ type: 'char', length: 3 }) currency!: string;
  @Column({ type: 'varchar', length: 16 }) status!: string;
  @Column({ name: 'reservation_status', type: 'varchar', length: 16 })
  reservationStatus!: string;
  @Column({ name: 'reservation_expires_at', type: 'timestamptz' })
  reservationExpiresAt!: Date;
  @Column({ name: 'payment_started_at', type: 'timestamptz', nullable: true })
  paymentStartedAt!: Date | null;
  @Column({ name: 'payment_submitted_at', type: 'timestamptz', nullable: true })
  paymentSubmittedAt!: Date | null;
  @Column({ name: 'payment_expires_at', type: 'timestamptz', nullable: true })
  paymentExpiresAt!: Date | null;
  @Column({
    name: 'provider_payment_id',
    type: 'varchar',
    length: 128,
    nullable: true,
    unique: true,
  })
  providerPaymentId!: string | null;
  @Column({
    name: 'provider_payment_status',
    type: 'varchar',
    length: 16,
    nullable: true,
  })
  providerPaymentStatus!: string | null;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
