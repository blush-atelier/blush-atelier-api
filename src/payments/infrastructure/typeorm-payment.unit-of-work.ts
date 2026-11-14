import { Injectable, Logger } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import type {
  PaymentStore,
  PaymentUnitOfWork,
  PaymentResult,
  PaymentRecord,
} from '../domain/payment-ports';
import type { PaymentObservation } from '../domain/payment-gateway.port';
import type { PaymentDecision } from '../domain/payment-transition';
class PaymentRollback {
  constructor(readonly result: PaymentResult<never>) {}
}
class PostgresPaymentStore implements PaymentStore {
  constructor(private readonly manager: EntityManager) {}
  private async read(
    where: string,
    values: string[],
  ): Promise<PaymentRecord | null> {
    const rows = (await this.manager.query(
      `SELECT t.id,t.customer_id AS "customerId",t.delivery_id AS "deliveryId",t.reference,
      t.total_minor AS "totalMinor",t.currency,t.status,t.reservation_status AS "reservationStatus",
      t.provider_payment_id AS "providerPaymentId",t.reservation_expires_at AS "reservationExpiresAt",
      t.payment_started_at AS "paymentStartedAt",t.payment_expires_at AS "paymentExpiresAt",
      t.payment_submitted_at AS "paymentSubmittedAt",c.email AS "customerEmail"
      FROM transactions t JOIN customers c ON c.id=t.customer_id WHERE ${where} FOR UPDATE OF t`,
      values,
    )) as (Omit<
      PaymentRecord,
      | 'reservationExpiresAt'
      | 'paymentStartedAt'
      | 'paymentExpiresAt'
      | 'paymentSubmittedAt'
    > & {
      reservationExpiresAt: Date;
      paymentStartedAt: Date | null;
      paymentExpiresAt: Date | null;
      paymentSubmittedAt: Date | null;
    })[];
    const row = rows[0];
    return row
      ? {
          ...row,
          reservationExpiresAt: row.reservationExpiresAt.toISOString(),
          paymentStartedAt: row.paymentStartedAt?.toISOString() ?? null,
          paymentExpiresAt: row.paymentExpiresAt?.toISOString() ?? null,
          paymentSubmittedAt: row.paymentSubmittedAt?.toISOString() ?? null,
        }
      : null;
  }
  find(id: string, customerId: string) {
    return this.read('t.id=$1 AND t.customer_id=$2', [id, customerId]);
  }
  findByReference(reference: string) {
    return this.read('t.reference=$1', [reference]);
  }
  async claimSubmission(id: string, now: Date, expiresAt: string) {
    await this.manager.query(
      'UPDATE transactions SET payment_submitted_at=$2,payment_started_at=$2,payment_expires_at=$3,updated_at=$2 WHERE id=$1',
      [id, now, expiresAt],
    );
  }
  async start(id: string, now: Date, expiresAt: string) {
    await this.manager.query(
      'UPDATE transactions SET payment_started_at=$2,payment_expires_at=$3,updated_at=$2 WHERE id=$1',
      [id, now, expiresAt],
    );
  }
  async apply(
    record: PaymentRecord,
    observation: PaymentObservation,
    decision: PaymentDecision,
  ) {
    if (decision.kind === 'already-applied') return;
    if (decision.kind === 'confirm' || decision.kind === 'release') {
      const rows = (await this.manager.query(
        `UPDATE products p SET
        stock_reserved=p.stock_reserved-i.quantity,
        stock_on_hand=p.stock_on_hand-CASE WHEN $2::boolean THEN i.quantity ELSE 0 END,
        updated_at=now()
        FROM transaction_items i WHERE i.transaction_id=$1 AND p.id=i.product_id
        RETURNING p.id`,
        [record.id, decision.kind === 'confirm'],
      )) as [unknown[], number];
      const counts = (await this.manager.query(
        'SELECT count(*)::integer AS count FROM transaction_items WHERE transaction_id=$1',
        [record.id],
      )) as { count: number }[];
      if (!counts[0].count || rows[1] !== counts[0].count)
        throw new Error('Incomplete payment stock update');
    }
    const status =
      decision.kind === 'pending'
        ? 'PENDING'
        : decision.kind === 'confirm'
          ? 'APPROVED'
          : decision.status;
    const reservation =
      decision.kind === 'pending'
        ? 'ACTIVE'
        : decision.kind === 'confirm'
          ? 'CONFIRMED'
          : 'RELEASED';
    await this.manager.query(
      `UPDATE transactions SET provider_payment_id=$2,provider_payment_status=$3,
      status=$4,reservation_status=$5,updated_at=now() WHERE id=$1`,
      [record.id, observation.id, observation.status, status, reservation],
    );
    if (decision.kind === 'confirm')
      await this.manager.query(
        "UPDATE deliveries SET status='READY',updated_at=now() WHERE id=$1",
        [record.deliveryId],
      );
  }
}
@Injectable()
export class TypeOrmPaymentUnitOfWork implements PaymentUnitOfWork {
  private readonly logger = new Logger(TypeOrmPaymentUnitOfWork.name);
  constructor(private readonly source: DataSource) {}
  async run<T>(
    work: (store: PaymentStore) => Promise<PaymentResult<T>>,
  ): Promise<PaymentResult<T>> {
    try {
      return await this.source.transaction(async (manager) => {
        // Mismo bloqueo que reserva/expiración: no compiten por las mismas unidades sin coordinación.
        await manager.query('SELECT pg_advisory_xact_lock(731046285)');
        const result = await work(new PostgresPaymentStore(manager));
        if (!result.ok) throw new PaymentRollback(result);
        return result;
      });
    } catch (error) {
      if (error instanceof PaymentRollback) return error.result;
      this.logger.error('Payment storage unavailable');
      return { ok: false, error: 'CheckoutStorageUnavailable' };
    }
  }
}
