import { createHmac, timingSafeEqual } from 'node:crypto';
import { NormalizedPaymentEvent, PaymentProvider } from './types';
import { mapRazorpayFailureCategory } from './failure-mapping';

/**
 * Razorpay adapter (test mode for the demo) — spec §51.
 *
 * Webhook signature: Razorpay sends `x-razorpay-signature` = HMAC-SHA256 of the
 * raw body using the webhook secret. Verification is constant-time.
 *
 * Retry: POST {idempotencyKey} to the payments API is not natively idempotent,
 * so the idempotency key is carried as a caller-supplied reference and the
 * caller must consult the action registry first (spec §16). The API key/secret
 * come from env at construction time — never hardcoded.
 */

const SUPPORTED_EVENTS = new Set(['payment.failed', 'payment.captured']);

interface RazorpayWebhookPayload {
  event?: string;
  payload?: {
    payment?: {
      entity?: {
        id?: string;
        amount?: number;
        currency?: string;
        status?: string;
        error_code?: string;
        error_description?: string;
        customer_id?: string;
        subscription_id?: string;
        created_at?: number;
      };
    };
  };
}

export class RazorpayPaymentProvider implements PaymentProvider {
  readonly name = 'razorpay';

  constructor(
    private readonly keyId: string,
    private readonly keySecret: string,
    private readonly baseUrl = 'https://api.razorpay.com/v1',
    private readonly fetchImpl: typeof fetch = fetch,
  ) {
    if (!keyId || !keySecret) {
      throw new Error('RazorpayPaymentProvider requires RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET');
    }
  }

  verifyWebhookSignature(rawBody: string, signature: string, webhookSecret: string): boolean {
    if (typeof rawBody !== 'string' || typeof signature !== 'string' || !webhookSecret) return false;
    let expected: Buffer;
    try {
      expected = createHmac('sha256', webhookSecret).update(rawBody, 'utf8').digest();
    } catch {
      return false;
    }
    let provided: Buffer;
    try {
      provided = Buffer.from(signature, 'hex');
    } catch {
      return false;
    }
    if (provided.length !== expected.length) return false;
    return timingSafeEqual(provided, expected);
  }

  parseWebhookEvent(rawBody: string): NormalizedPaymentEvent {
    let body: RazorpayWebhookPayload;
    try {
      body = JSON.parse(rawBody) as RazorpayWebhookPayload;
    } catch {
      throw new Error('Invalid webhook JSON');
    }
    const event = body.event ?? '';
    if (!SUPPORTED_EVENTS.has(event)) {
      throw new Error(`Unsupported Razorpay event: ${event}`);
    }
    const entity = body.payload?.payment?.entity;
    if (!entity?.id || typeof entity.amount !== 'number') {
      throw new Error('Malformed Razorpay payment payload');
    }
    const eventType =
      event === 'payment.captured' ? 'payment.captured' as const : 'payment.failed' as const;

    return {
      provider: this.name,
      providerEventId: `rzp_${entity.id}_${event}`,
      eventType,
      externalPaymentId: entity.id,
      externalCustomerId: entity.customer_id,
      externalSubscriptionId: entity.subscription_id,
      amountMinor: entity.amount,
      currency: entity.currency ?? 'INR',
      failureCode: entity.error_code,
      failureReason: entity.error_description,
      failureCategory:
        eventType === 'payment.failed'
          ? mapRazorpayFailureCategory(entity.error_code, entity.error_description)
          : mapRazorpayFailureCategory(undefined, undefined),
      occurredAt: entity.created_at ? new Date(entity.created_at * 1000) : new Date(),
      raw: body,
    };
  }

  async retryPayment(input: {
    externalPaymentId: string;
    amountMinor: number;
    idempotencyKey: string;
  }): Promise<{ providerRetryId: string; status: 'INITIATED' | 'FAILED'; failureReason?: string }> {
    const auth = Buffer.from(`${this.keyId}:${this.keySecret}`).toString('base64');
    let res: Response;
    try {
      res = await this.fetchImpl(`${this.baseUrl}/payments/${encodeURIComponent(input.externalPaymentId)}/retry`, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${auth}`,
          'Content-Type': 'application/json',
          'X-Razorpay-Idempotency-Key': input.idempotencyKey,
        },
        body: JSON.stringify({ amount: input.amountMinor, reference_id: input.idempotencyKey }),
      });
    } catch (e) {
      return { providerRetryId: '', status: 'FAILED', failureReason: `network: ${String(e)}` };
    }
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      return { providerRetryId: '', status: 'FAILED', failureReason: `http_${res.status}: ${text.slice(0, 200)}` };
    }
    const json = (await res.json().catch(() => ({}))) as { id?: string; status?: string };
    return {
      providerRetryId: json.id ?? '',
      status: json.status === 'failed' ? 'FAILED' : 'INITIATED',
    };
  }
}
