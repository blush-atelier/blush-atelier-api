import {
  validText,
  validPhone,
  type CheckoutResult,
} from '../../shared/domain/checkout';
export interface DeliveryInput {
  recipientName: string;
  recipientPhone: string;
  addressLine: string;
  city: string;
  region: string;
  countryCode: string;
}
export interface Delivery extends DeliveryInput {
  id: string;
  customerId: string;
}
export function createDelivery(
  id: string,
  customerId: string,
  input: DeliveryInput,
): CheckoutResult<Delivery> {
  const delivery: Delivery = {
    id,
    customerId,
    recipientName: input.recipientName.trim().normalize('NFC'),
    recipientPhone: input.recipientPhone.trim().replace(/[ ()-]/g, ''),
    addressLine: input.addressLine.trim(),
    city: input.city.trim(),
    region: input.region.trim(),
    countryCode: input.countryCode.trim().toUpperCase(),
  };
  if (
    !validText(delivery.recipientName, 2, 120) ||
    !/^[\p{L}\p{M} .'-]+$/u.test(delivery.recipientName) ||
    !validPhone(delivery.recipientPhone) ||
    !validText(delivery.addressLine, 5, 250) ||
    !validText(delivery.city, 2, 100) ||
    !validText(delivery.region, 2, 100) ||
    delivery.countryCode !== 'CO'
  )
    return { ok: false, error: 'InvalidDelivery' };
  return { ok: true, value: delivery };
}
