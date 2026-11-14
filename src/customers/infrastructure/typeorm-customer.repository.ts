import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { CustomerRepository } from '../domain/customer-repository.port';
import type { Customer } from '../domain/customer';
import type { CheckoutResult } from '../../shared/domain/checkout';
import { CustomerOrmEntity } from './customer.orm-entity';
@Injectable()
export class TypeOrmCustomerRepository implements CustomerRepository {
  private readonly logger = new Logger(TypeOrmCustomerRepository.name);
  constructor(private readonly source: DataSource) {}
  async insert(
    customer: Customer,
    sessionHash: string,
    expiresAt: Date,
  ): Promise<CheckoutResult<void>> {
    try {
      await this.source.getRepository(CustomerOrmEntity).insert({
        id: customer.id,
        fullName: customer.fullName,
        email: customer.email,
        phone: customer.phone,
        sessionHash,
        sessionExpiresAt: expiresAt,
      });
      return { ok: true, value: undefined };
    } catch {
      this.logger.error('Customer registration unavailable');
      return { ok: false, error: 'CheckoutStorageUnavailable' };
    }
  }
  async findSession(
    hash: string,
  ): Promise<CheckoutResult<{ customerId: string; expiresAt: Date } | null>> {
    try {
      const rows: { id: string; session_expires_at: Date }[] =
        await this.source.query(
          'SELECT id, session_expires_at FROM customers WHERE session_hash = $1',
          [hash],
        );
      return {
        ok: true,
        value: rows[0]
          ? { customerId: rows[0].id, expiresAt: rows[0].session_expires_at }
          : null,
      };
    } catch {
      this.logger.error('Checkout authentication unavailable');
      return { ok: false, error: 'CheckoutStorageUnavailable' };
    }
  }
}
