import { createHash } from 'node:crypto';
import type {
  CardPaymentsGateway,
  CardGatewayResult,
  CardConfiguration,
  CardChargeRequest,
} from '../domain/card-payments.port';
import type { PaymentObservation } from '../domain/payment-gateway.port';
import { paymentObservation, type WompiSettings } from './wompi';
const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const webUrl = (value: unknown): value is string => {
  if (typeof value !== 'string') return false;
  try {
    const u = new URL(value);
    return u.protocol === 'https:' && !u.username && !u.password;
  } catch {
    return false;
  }
};
export class WompiCards implements CardPaymentsGateway {
  get enabled(): boolean {
    return this.settings.enabled;
  }
  constructor(
    private readonly settings: WompiSettings,
    private readonly request: typeof fetch = fetch,
  ) {}
  async configuration(): Promise<CardGatewayResult<CardConfiguration>> {
    if (!this.settings.enabled)
      return { ok: false, error: 'PaymentNotConfigured' };
    try {
      const headers = {
        Authorization: `Bearer ${this.settings.publicKey}`,
        Accept: 'application/json',
      };
      const [merchant, key] = await Promise.all([
        this.request(
          `${this.settings.apiUrl}/merchants/${encodeURIComponent(this.settings.publicKey)}`,
          { headers, signal: AbortSignal.timeout(8000), redirect: 'error' },
        ),
        this.request(`${this.settings.apiUrl}/tokens/keys/tokenization`, {
          headers,
          signal: AbortSignal.timeout(8000),
          redirect: 'error',
        }),
      ]);
      if (!merchant.ok || !key.ok)
        return { ok: false, error: 'PaymentProviderUnavailable' };
      const m: unknown = await merchant.json(),
        k: unknown = await key.json();
      const md = record(m) && record(m.data) ? m.data : null,
        kd = record(k) && record(k.data) ? k.data : null;
      const privacy =
        md && record(md.presigned_acceptance) ? md.presigned_acceptance : null;
      const personal =
        md && record(md.presigned_personal_data_auth)
          ? md.presigned_personal_data_auth
          : null;
      if (
        !privacy ||
        !personal ||
        !kd ||
        typeof kd.publicKey !== 'string' ||
        kd.publicKey.length > 8192 ||
        !kd.publicKey.includes('-----BEGIN PUBLIC KEY-----') ||
        !webUrl(privacy.permalink) ||
        !webUrl(personal.permalink) ||
        typeof privacy.acceptance_token !== 'string' ||
        typeof personal.acceptance_token !== 'string' ||
        !privacy.acceptance_token ||
        !personal.acceptance_token
      )
        return { ok: false, error: 'InvalidProviderResponse' };
      // Solo datos públicos de integración y las aceptaciones; nunca contacto del comercio o secretos.
      return {
        ok: true,
        value: {
          apiUrl: this.settings.apiUrl,
          publicKey: this.settings.publicKey,
          encryptionKey: kd.publicKey,
          privacyUrl: privacy.permalink,
          personalDataUrl: personal.permalink,
          acceptanceToken: privacy.acceptance_token,
          personalDataToken: personal.acceptance_token,
        },
      };
    } catch {
      return { ok: false, error: 'PaymentProviderUnavailable' };
    }
  }
  async charge(
    input: CardChargeRequest,
  ): Promise<CardGatewayResult<PaymentObservation>> {
    if (!this.settings.enabled)
      return { ok: false, error: 'PaymentNotConfigured' };
    if (
      !/^[1-9][0-9]{0,18}$/.test(input.amountMinor) ||
      BigInt(input.amountMinor) > BigInt(Number.MAX_SAFE_INTEGER)
    )
      return { ok: false, error: 'AmountOutOfRange' };
    const signature = createHash('sha256')
      .update(
        `${input.reference}${input.amountMinor}COP${this.settings.integritySecret}`,
      )
      .digest('hex');
    try {
      const response = await this.request(
        `${this.settings.apiUrl}/transactions`,
        {
          method: 'POST',
          redirect: 'error',
          signal: AbortSignal.timeout(15000),
          headers: {
            Authorization: `Bearer ${this.settings.privateKey}`,
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify({
            amount_in_cents: Number(input.amountMinor),
            currency: 'COP',
            reference: input.reference,
            signature,
            customer_email: input.customerEmail,
            ip: input.clientIp,
            acceptance_token: input.acceptanceToken,
            accept_personal_auth: input.personalDataToken,
            payment_method_type: 'CARD',
            payment_method: {
              type: 'CARD',
              token: input.token,
              installments: input.installments,
            },
          }),
        },
      );
      // Una respuesta técnica o referencia duplicada no prueba que no se haya enviado el pago.
      if (!response.ok)
        return { ok: false, error: 'PaymentProviderUnavailable' };
      const observed = paymentObservation(await response.json());
      return observed
        ? { ok: true, value: observed }
        : { ok: false, error: 'InvalidProviderResponse' };
    } catch {
      return { ok: false, error: 'PaymentProviderUnavailable' };
    }
  }
}
