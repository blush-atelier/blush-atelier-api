import type { StoredTransaction } from '../domain/checkout-unit-of-work.port';
export function transactionView(transaction: StoredTransaction) {
  return {
    id: transaction.id,
    reference: transaction.reference,
    status: transaction.status,
    reservationStatus: transaction.reservationStatus,
    reservationExpiresAt: transaction.reservationExpiresAt,
    productId: transaction.productId,
    quantity: transaction.quantity,
    currency: transaction.currency,
    unitPriceMinor: transaction.unitPriceMinor,
    productAmountMinor: transaction.productAmountMinor,
    baseFeeMinor: transaction.baseFeeMinor,
    deliveryFeeMinor: transaction.deliveryFeeMinor,
    totalMinor: transaction.totalMinor,
  };
}
