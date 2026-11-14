import { createHash } from 'node:crypto';
import { wompiSettings } from '../src/payments/infrastructure/wompi';
export const settings = wompiSettings({
  WOMPI_ENABLED: 'true',
  WOMPI_PUBLIC_KEY: 'pub_test_fixture',
  WOMPI_PRIVATE_KEY: 'prv_test_fixture',
  WOMPI_INTEGRITY_SECRET: 'test_integrity_fixture',
  WOMPI_EVENTS_SECRET: 'test_events_fixture',
});
export const data = {
  id: 'payment-1',
  reference: 'BA-order',
  amount_in_cents: 10490000,
  currency: 'COP',
  status: 'APPROVED',
};
export function eventBody(id = data.id) {
  const transaction = { ...data, id };
  const timestamp = 1794600000;
  const properties = [
    'transaction.status',
    'transaction.amount_in_cents',
    'transaction.id',
  ];
  const checksum = createHash('sha256')
    .update(
      `${transaction.status}${transaction.amount_in_cents}${id}${timestamp}${settings.eventsSecret}`,
    )
    .digest('hex');
  return {
    event: 'transaction.updated',
    environment: 'test',
    data: { transaction },
    timestamp,
    signature: { properties, checksum },
  };
}
