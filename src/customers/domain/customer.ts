import {
  validText,
  validPhone,
  type CheckoutResult,
} from '../../shared/domain/checkout';
export interface Customer {
  id: string;
  fullName: string;
  email: string;
  phone: string;
}
export interface CustomerInput {
  fullName: string;
  email: string;
  phone: string;
}
export function createCustomer(
  id: string,
  input: CustomerInput,
): CheckoutResult<Customer> {
  const fullName = input.fullName.trim().normalize('NFC');
  const email = input.email.trim().toLowerCase();
  const phone = input.phone.trim().replace(/[ ()-]/g, '');
  if (
    !validText(fullName, 2, 120) ||
    !/^[\p{L}\p{M} .'-]+$/u.test(fullName) ||
    !validText(email, 3, 254) ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
    !validPhone(phone)
  )
    return { ok: false, error: 'InvalidCustomer' };
  return { ok: true, value: { id, fullName, email, phone } };
}
