import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('products')
export class ProductOrmEntity {
  @PrimaryColumn('uuid') id!: string;
  @Column({ type: 'varchar', length: 80, unique: true }) sku!: string;
  @Column({ type: 'varchar', length: 180 }) name!: string;
  @Column('text') description!: string;
  @Column({ name: 'image_url', type: 'text', nullable: true }) imageUrl!:
    string | null;
  // pg entrega BIGINT como string para conservar valores mayores a MAX_SAFE_INTEGER.
  @Column({ name: 'price_minor', type: 'bigint' }) priceMinor!: string;
  @Column({ type: 'char', length: 3 }) currency!: 'COP';
  @Column({ name: 'stock_on_hand', type: 'integer' }) stockOnHand!: number;
  @Column({ name: 'stock_reserved', type: 'integer', default: 0 })
  stockReserved!: number;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
