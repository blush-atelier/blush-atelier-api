import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
@Entity('customers')
export class CustomerOrmEntity {
  @PrimaryColumn('uuid') id!: string;
  @Column({ name: 'full_name', type: 'varchar', length: 120 })
  fullName!: string;
  @Column({ type: 'varchar', length: 254 }) email!: string;
  @Column({ type: 'varchar', length: 16 }) phone!: string;
  @Column({
    name: 'session_hash',
    type: 'char',
    length: 64,
    unique: true,
    select: false,
  })
  sessionHash!: string;
  @Column({ name: 'session_expires_at', type: 'timestamptz' })
  sessionExpiresAt!: Date;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
