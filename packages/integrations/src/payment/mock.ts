import { createHmac, timingSafeEqual } from 'node:crypto';
import { FailureCategory } from '@recoverai/domain';
import { NormalizedPaymentEvent, PaymentProvider } from './types';

/**
 * Mock payment provider — automated tests and local failure simulation ONLY
 * (spec §71). Never the primary implementation; the demo runs real Razorpay
 * test mode.
 */
export class MockPaymentProvider implements PaymentProvider {
  readonly name = 'mock';
  private seq = 0;

  constructor(private readonly secret = 'mock_webhook_secret') {}

  verifyWebhookSignature(rawBody: string, signature: string, webhookSecret: string): boolean {
    const expected = createHmac('sha256', webhookSecret).update(rawBody, 'utf8').digest('hex');
    try {
      return timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(expected, 'hex'));
    } catch {
      return false;
    }
  }

  /** Builds a signed mock webhook body for tests/simulation. */
  buildWebhookBody(input: {
    event: 'payment.failed' | 'payment.captured';
    externalPaymentId: string;
    amountMinor: number;
    failureCode?: string;
    failureReason?: string;
    externalCustomerId?: string;
  }): { body: string; signature: string } {
    const body = JSON.stringify({
      event: input.event,
      payload: {
        payment: {
          entity: {
            id: input.externalPaymentId,
            amount: input.amountMinor,
            currency: 'INR',
            customer_id: input.externalCustomerId,
            error_code: input.failureCode,
            error_description: input.failureReason,
            created_at: Math.floor(Date.now() / 1000),
          },
        },
      },
    });
    const signature = createHmac('sha256', this.secret).update(body, 'utf8').digest('hex');
    return { body, signature };
  }

  parseWebhookEvent(rawBody: string): NormalizedPaymentEvent {
    const parsed = JSON.parse(rawBody) as {
      event: string;
      payload: { payment: { entity: Record<string, unknown> } };
    };
    const e = parsed.payload.payment.entity;
    const eventType = parsed.event === 'payment.captured' ? ('payment.captured' as const) : ('payment.failed' as const);
    return {
      provider: this.name,
      providerEventId: `mock_${String(e.id)}_${parsed.event}`,
      eventType,
      externalPaymentId: String(e.id),
      externalCustomerId: e.customer_id as string | undefined,
      amountMinor: Number(e.amount),
      currency: 'INR',
      failureCode: e.error_code as string | undefined,
      failureReason: e.error_description as string | undefined,
      failureCategory: eventType === 'payment.failed' ? mapMockCategory(e.error_code as string) : FailureCategory.UNKNOWN,
      occurredAt: new Date(),
      raw: parsed,
    };
  }

  async retryPayment(input: {
    externalPaymentId: string;
    amountMinor: number;
    idempotencyKey: string;
  }): Promise<{ providerRetryId: string; status: 'INITIATED' | 'FAILED'; failureReason?: string }> {
    this.seq += 1;
    // Deterministic simulation: payments whose id contains "always_fail" fail.
    if (input.externalPaymentId.includes('always_fail')) {
      return { providerRetryId: `mock_retry_${this.seq}`, status: 'FAILED', failureReason: 'simulated decline' };
    }
    return { providerRetryId: `mock_retry_${this.seq}`, status: 'INITIATED' };
  }
}

function mapMockCategory(code: string): FailureCategory {
  const c = (code ?? '').toUpperCase();
  if (c === 'INSUFFICIENT_FUNDS') return FailureCategory.INSUFFICIENT_FUNDS;
  if (c === 'CARD_EXPIRED') return FailureCategory.EXPIRED_CARD;
  return FailureCategory.UNKNOWN;
}
