import type { MigrationInterface, QueryRunner } from 'typeorm';
export class AddBasket1794528002000 implements MigrationInterface {
  async up(runner: QueryRunner): Promise<void> {
    await runner.query(`CREATE TABLE transaction_items (
      transaction_id UUID NOT NULL REFERENCES transactions(id) ON DELETE RESTRICT,
      product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
      quantity INTEGER NOT NULL CHECK(quantity>0),
      unit_price_minor BIGINT NOT NULL CHECK(unit_price_minor>=0),
      product_amount_minor BIGINT NOT NULL CHECK(product_amount_minor>=0),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY(transaction_id,product_id),
      CHECK(product_amount_minor::numeric=unit_price_minor::numeric*quantity)
    )`);
    await runner.query(
      'CREATE INDEX transaction_items_product_idx ON transaction_items(product_id)',
    );
    await runner.query(
      'INSERT INTO transaction_items(transaction_id,product_id,quantity,unit_price_minor,product_amount_minor) SELECT id,product_id,quantity,unit_price_minor,product_amount_minor FROM transactions',
    );
    // El importe de cabecera ahora suma todas las líneas, no solo el producto original.
    const checks: { conname: string }[] = await runner.query(
      `SELECT conname FROM pg_constraint WHERE conrelid='transactions'::regclass AND contype='c' AND pg_get_constraintdef(oid) LIKE '%product_amount_minor = (unit_price_minor * quantity)%'`,
    );
    for (const check of checks)
      await runner.query(
        `ALTER TABLE transactions DROP CONSTRAINT "${check.conname.replace(/"/g, '""')}"`,
      );
  }
  async down(runner: QueryRunner): Promise<void> {
    const multiple: unknown[] = await runner.query(
      'SELECT transaction_id FROM transaction_items GROUP BY transaction_id HAVING count(*)>1 LIMIT 1',
    );
    if (multiple.length)
      throw new Error('Cannot roll back baskets without losing order lines');
    await runner.query('DROP TABLE transaction_items');
    await runner.query(
      'ALTER TABLE transactions ADD CHECK(product_amount_minor=unit_price_minor*quantity)',
    );
  }
}
