import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateProducts1794528000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE products (
        id UUID PRIMARY KEY,
        sku VARCHAR(80) NOT NULL UNIQUE CHECK (length(trim(sku)) > 0),
        name VARCHAR(180) NOT NULL CHECK (length(trim(name)) > 0),
        description TEXT NOT NULL,
        image_url TEXT,
        price_minor BIGINT NOT NULL CHECK (price_minor >= 0),
        currency CHAR(3) NOT NULL CHECK (currency = 'COP'),
        stock_on_hand INTEGER NOT NULL CHECK (stock_on_hand >= 0),
        stock_reserved INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT products_reserved_stock CHECK (stock_reserved >= 0 AND stock_reserved <= stock_on_hand)
      )
    `);
  }
  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE products');
  }
}
