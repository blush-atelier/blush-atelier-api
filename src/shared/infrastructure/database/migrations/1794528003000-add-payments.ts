import type { MigrationInterface, QueryRunner } from 'typeorm';
export class AddPayments1794528003000 implements MigrationInterface {
  async up(runner: QueryRunner): Promise<void> {
    await runner.query(`ALTER TABLE transactions
      ADD COLUMN payment_expires_at TIMESTAMPTZ,
      ADD COLUMN provider_payment_id VARCHAR(128) UNIQUE,
      ADD COLUMN provider_payment_status VARCHAR(16)
        CHECK(provider_payment_status IN ('PENDING','APPROVED','DECLINED','ERROR','VOIDED')),
      ADD CONSTRAINT payment_identity_check CHECK(provider_payment_id IS NULL OR payment_started_at IS NOT NULL)`);
  }
  async down(runner: QueryRunner): Promise<void> {
    // Evita borrar la trazabilidad de un pago al revertir el esquema.
    await runner.query(`DO $$ BEGIN
      IF EXISTS(SELECT 1 FROM transactions WHERE payment_started_at IS NOT NULL) THEN
        RAISE EXCEPTION 'Cannot remove payment tracking after payment started';
      END IF;
    END $$`);
    await runner.query(`ALTER TABLE transactions DROP CONSTRAINT payment_identity_check,
      DROP COLUMN provider_payment_status,DROP COLUMN provider_payment_id,DROP COLUMN payment_expires_at`);
  }
}
