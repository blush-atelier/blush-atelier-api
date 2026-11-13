import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
@Entity('deliveries')
export class DeliveryOrmEntity {
  @PrimaryColumn('uuid') id!: string;
  @Column({ name: 'customer_id', type: 'uuid' }) customerId!: string;
  @Column({ name: 'recipient_name', type: 'varchar', length: 120 })
  recipientName!: string;
  @Column({ name: 'recipient_phone', type: 'varchar', length: 16 })
  recipientPhone!: string;
  @Column({ name: 'address_line', type: 'varchar', length: 250 })
  addressLine!: string;
  @Column({ type: 'varchar', length: 100 }) city!: string;
  @Column({ type: 'varchar', length: 100 }) region!: string;
  @Column({ name: 'country_code', type: 'char', length: 2 })
  countryCode!: string;
  @Column({ type: 'varchar', length: 16, default: 'PENDING' }) status!: string;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
