import type { Result } from '../../shared/domain/result';
import { createHash, timingSafeEqual } from 'node:crypto';
import type {
  PaymentGateway,
  PaymentObservation,
  PaymentStatus,
  PaymentProviderError,
} from '../domain/payment-gateway.port';
import type {
  PaymentCheckout,
  PaymentEventVerifier,
  PaymentResult,
  PaymentSession,
} from '../domain/payment-ports';
const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
export interface WompiSettings {
  enabled: boolean;
  publicKey: string;
  privateKey: string;
  integritySecret: string;
  eventsSecret: string;
}
export function wompiSettings(
  env: NodeJS.ProcessEnv = process.env,
): WompiSettings {
  if (env.WOMPI_ENABLED && !['true', 'false'].includes(env.WOMPI_ENABLED))
    throw new Error('Invalid WOMPI_ENABLED');
  const value = {
    enabled: env.WOMPI_ENABLED === 'true',
    publicKey: env.WOMPI_PUBLIC_KEY ?? '',
    privateKey: env.WOMPI_PRIVATE_KEY ?? '',
    integritySecret: env.WOMPI_INTEGRITY_SECRET ?? '',
    eventsSecret: env.WOMPI_EVENTS_SECRET ?? '',
  };
  if (value.enabled) {
    for (const [key, prefix, variable] of [
      ['publicKey', 'pub_test_', 'WOMPI_PUBLIC_KEY'],
      ['privateKey', 'prv_test_', 'WOMPI_PRIVATE_KEY'],
      ['integritySecret', 'test_integrity_', 'WOMPI_INTEGRITY_SECRET'],
      ['eventsSecret', 'test_events_', 'WOMPI_EVENTS_SECRET'],
    ] as const)
      if (
        !value[key].startsWith(prefix) ||
        value[key].length <= prefix.length ||
        /\s/.test(value[key])
      )
        throw new Error(
          `Configure Wompi Sandbox keys and secrets: ${variable} must start with ${prefix} and contain no whitespace`,
        );
  }
  return value;
}
export class WompiGateway implements PaymentGateway {
  constructor(
    private readonly settings: WompiSettings,
    private readonly request: typeof fetch = fetch,
  ) {}
  async getPayment(
    id: string,
  ): Promise<Result<PaymentObservation, PaymentProviderError>> {
    if (!this.settings.enabled)
      return { ok: false, error: 'PaymentNotConfigured' };
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(id))
      return { ok: false, error: 'InvalidPaymentInput' };
    try {
      // URL fija Sandbox: una variable mal configurada no puede enviar cobros a producción.
      const response = await this.request(
        `https://sandbox.wompi.co/v1/transactions/${encodeURIComponent(id)}`,
        {
          headers: {
            Authorization: `Bearer ${this.settings.privateKey}`,
            Accept: 'application/json',
          },
          signal: AbortSignal.timeout(8000),
          redirect: 'error',
        },
      );
      if (!response.ok)
        return {
          ok: false,
          error:
            response.status === 404
              ? 'PaymentNotFound'
              : 'PaymentProviderUnavailable',
        };
      const body: unknown = await response.json();
      const data = record(body) && record(body.data) ? body.data : null;
      if (
        !data ||
        data.id !== id ||
        typeof data.reference !== 'string' ||
        !data.reference.length ||
        data.reference.length > 255 ||
        data.currency !== 'COP' ||
        typeof data.amount_in_cents !== 'number' ||
        !Number.isSafeInteger(data.amount_in_cents) ||
        data.amount_in_cents <= 0 ||
        typeof data.status !== 'string' ||
        !['PENDING', 'APPROVED', 'DECLINED', 'ERROR', 'VOIDED'].includes(
          data.status,
        )
      )
        return { ok: false, error: 'InvalidProviderResponse' };
      // Se proyectan campos seguros; no se propagan método de pago, contacto ni payload completo.
      return {
        ok: true,
        value: {
          id,
          reference: data.reference,
          amountMinor: String(data.amount_in_cents),
          currency: 'COP',
          status: data.status as PaymentStatus,
        },
      };
    } catch {
      return { ok: false, error: 'PaymentProviderUnavailable' };
    }
  }
}
export class WompiCheckout implements PaymentCheckout {
  constructor(private readonly settings: WompiSettings) {}
  create(
    reference: string,
    amountMinor: string,
    expiresAt: string,
  ): PaymentResult<PaymentSession> {
    if (!this.settings.enabled)
      return { ok: false, error: 'PaymentNotConfigured' };
    if (
      !/^[1-9][0-9]{0,18}$/.test(amountMinor) ||
      BigInt(amountMinor) > BigInt(Number.MAX_SAFE_INTEGER)
    )
      return { ok: false, error: 'AmountOutOfRange' };
    const integrity = createHash('sha256')
      .update(
        `${reference}${amountMinor}COP${expiresAt}${this.settings.integritySecret}`,
      )
      .digest('hex');
    return {
      ok: true,
      value: {
        reference,
        amountMinor,
        currency: 'COP',
        publicKey: this.settings.publicKey,
        integrity,
        expiresAt,
      },
    };
  }
}
export class WompiEvents implements PaymentEventVerifier {
  constructor(private readonly settings: WompiSettings) {}
  verify(body: unknown): PaymentResult<{ providerPaymentId: string }> {
    if (!this.settings.enabled)
      return { ok: false, error: 'PaymentNotConfigured' };
    if (
      !record(body) ||
      body.event !== 'transaction.updated' ||
      body.environment !== 'test' ||
      !record(body.data) ||
      !record(body.data.transaction) ||
      typeof body.data.transaction.id !== 'string' ||
      !/^[A-Za-z0-9_-]{1,128}$/.test(body.data.transaction.id) ||
      typeof body.timestamp !== 'number' ||
      !Number.isSafeInteger(body.timestamp) ||
      body.timestamp <= 0 ||
      !record(body.signature) ||
      typeof body.signature.checksum !== 'string' ||
      !/^[a-f0-9]{64}$/i.test(body.signature.checksum) ||
      !Array.isArray(body.signature.properties) ||
      !body.signature.properties.length ||
      body.signature.properties.length > 32 ||
      !body.signature.properties.includes('transaction.id')
    )
      return { ok: false, error: 'InvalidWebhook' };
    let concatenated = '';
    // Las propiedades firmadas vienen del evento; no se fija su orden ni se recorren prototipos.
    for (const path of body.signature.properties) {
      if (typeof path !== 'string' || path.length > 128)
        return { ok: false, error: 'InvalidWebhook' };
      let current: unknown = body.data;
      for (const part of path.split('.')) {
        if (
          ['__proto__', 'prototype', 'constructor'].includes(part) ||
          !record(current) ||
          !Object.hasOwn(current, part)
        )
          return { ok: false, error: 'InvalidWebhook' };
        current = current[part];
      }
      if (!(
        typeof current === 'string' ||
        typeof current === 'boolean' ||
        (typeof current === 'number' && Number.isSafeInteger(current))
      ))
        return { ok: false, error: 'InvalidWebhook' };
      concatenated += String(current);
    }
    const expected = createHash('sha256')
      .update(concatenated + body.timestamp + this.settings.eventsSecret)
      .digest();
    const received = Buffer.from(body.signature.checksum, 'hex');
    return timingSafeEqual(expected, received)
      ? { ok: true, value: { providerPaymentId: body.data.transaction.id } }
      : { ok: false, error: 'InvalidWebhook' };
  }
}
