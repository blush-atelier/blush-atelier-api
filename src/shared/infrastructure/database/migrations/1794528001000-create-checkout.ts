import type { MigrationInterface, QueryRunner } from 'typeorm';
export class CreateCheckout1794528001000 implements MigrationInterface {
  async up(runner: QueryRunner): Promise<void> {
    await runner.query(`CREATE TABLE customers (
   id UUID PRIMARY KEY, full_name VARCHAR(120) NOT NULL CHECK(length(trim(full_name))>=2),
   email VARCHAR(254) NOT NULL, phone VARCHAR(16) NOT NULL,
   session_hash CHAR(64) NOT NULL UNIQUE CHECK(session_hash ~ '^[a-f0-9]{64}$'),
   session_expires_at TIMESTAMPTZ NOT NULL,
   created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`);
    await runner.query(`CREATE TABLE deliveries (
   id UUID PRIMARY KEY, customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
   recipient_name VARCHAR(120) NOT NULL, recipient_phone VARCHAR(16) NOT NULL,
   address_line VARCHAR(250) NOT NULL, city VARCHAR(100) NOT NULL, region VARCHAR(100) NOT NULL,
   country_code CHAR(2) NOT NULL CHECK(country_code='CO'),
   status VARCHAR(16) NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','READY')),
   created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
   UNIQUE(id,customer_id)
  )`);
    await runner.query(
      'CREATE INDEX deliveries_customer_idx ON deliveries(customer_id)',
    );
    await runner.query(`CREATE TABLE transactions (
   id UUID PRIMARY KEY, reference VARCHAR(50) NOT NULL UNIQUE,
   customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
   delivery_id UUID NOT NULL UNIQUE, product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
   idempotency_key VARCHAR(128) NOT NULL, request_hash CHAR(64) NOT NULL,
   quantity INTEGER NOT NULL CHECK(quantity>0),
   unit_price_minor BIGINT NOT NULL CHECK(unit_price_minor>=0),
   product_amount_minor BIGINT NOT NULL CHECK(product_amount_minor>=0),
   base_fee_minor BIGINT NOT NULL CHECK(base_fee_minor>0), delivery_fee_minor BIGINT NOT NULL CHECK(delivery_fee_minor>=0),
   total_minor BIGINT NOT NULL CHECK(total_minor>=0), currency CHAR(3) NOT NULL CHECK(currency='COP'),
   status VARCHAR(16) NOT NULL CHECK(status IN ('PENDING','APPROVED','DECLINED','ERROR','EXPIRED')),
   reservation_status VARCHAR(16) NOT NULL CHECK(reservation_status IN ('ACTIVE','CONFIRMED','RELEASED')),
   reservation_expires_at TIMESTAMPTZ NOT NULL, payment_started_at TIMESTAMPTZ,
   created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
   UNIQUE(customer_id,idempotency_key),
   FOREIGN KEY(delivery_id,customer_id) REFERENCES deliveries(id,customer_id) ON DELETE RESTRICT,
   CHECK(product_amount_minor=unit_price_minor*quantity),
   CHECK(total_minor=product_amount_minor+base_fee_minor+delivery_fee_minor),
   CHECK((status='PENDING' AND reservation_status='ACTIVE') OR (status='APPROVED' AND reservation_status='CONFIRMED') OR (status IN ('DECLINED','ERROR','EXPIRED') AND reservation_status='RELEASED'))
  )`);
    await runner.query(
      'CREATE INDEX transactions_product_idx ON transactions(product_id)',
    );
    await runner.query(
      'CREATE INDEX transactions_pending_idx ON transactions(status,reservation_expires_at)',
    );
  }
  async down(runner: QueryRunner): Promise<void> {
    await runner.query('DROP TABLE transactions');
    await runner.query('DROP TABLE deliveries');
    await runner.query('DROP TABLE customers');
  }
}
