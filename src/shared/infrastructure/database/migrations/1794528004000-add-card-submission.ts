import type { MigrationInterface, QueryRunner } from 'typeorm';
export class AddCardSubmission1794528004000 implements MigrationInterface {
  async up(runner: QueryRunner): Promise<void> {
    await runner.query(`ALTER TABLE transactions ADD COLUMN payment_submitted_at TIMESTAMPTZ,
      ADD CONSTRAINT payment_submission_check CHECK(payment_submitted_at IS NULL OR payment_started_at IS NOT NULL)`);
  }
  async down(runner: QueryRunner): Promise<void> {
    await runner.query(`DO $$ BEGIN
      IF EXISTS(SELECT 1 FROM transactions WHERE payment_submitted_at IS NOT NULL) THEN
        RAISE EXCEPTION 'Cannot remove card payment tracking after submission';
      END IF;
    END $$`);
    await runner.query(
      'ALTER TABLE transactions DROP CONSTRAINT payment_submission_check,DROP COLUMN payment_submitted_at',
    );
  }
}
