import { FailureCategory } from '@recoverai/domain';

/**
 * Normalized webhook event emitted by any payment provider.
 * All amounts are integer minor units (paise) — spec §43.
 */
export interface NormalizedPaymentEvent {
  provider: string;
  /** Provider's unique event id, used for webhook idempotency (spec §16). */
  providerEventId: string;
  eventType: 'payment.failed' | 'payment.captured' | 'payment.refunded';
  externalPaymentId: string;
  externalCustomerId?: string;
  externalSubscriptionId?: string;
  amountMinor: number;
  currency: string;
  failureCode?: string;
  failureReason?: string;
  failureCategory: FailureCategory;
  occurredAt: Date;
  /** Raw provider payload, stored for audit/replay. */
  raw: unknown;
}

/**
 * Deterministic payment-provider abstraction (spec §51).
 * Business logic never depends on Razorpay directly — only on this interface.
 */
export interface PaymentProvider {
  readonly name: string;
  /**
   * Verify the provider's webhook signature over the raw request body.
   * Must be constant-time; must return false for any malformed input.
   */
  verifyWebhookSignature(rawBody: string, signature: string, webhookSecret: string): boolean;
  /** Parse + normalize a webhook payload into a domain event. Throws on unknown shapes. */
  parseWebhookEvent(rawBody: string): NormalizedPaymentEvent;
  /**
   * Attempt a payment retry through the provider (test mode in demo).
   * Returns the provider's retry reference id.
   */
  retryPayment(input: {
    externalPaymentId: string;
    amountMinor: number;
    idempotencyKey: string;
  }): Promise<{ providerRetryId: string; status: 'INITIATED' | 'FAILED'; failureReason?: string }>;
}
