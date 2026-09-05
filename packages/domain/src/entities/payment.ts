import { FailureCategory, PaymentStatus } from '../enums';
import { Money } from '../money';

export class Payment {
  constructor(
    public readonly id: string,
    public readonly merchant_id: string,
    public readonly customer_id: string,
    public readonly subscription_id: string | null,
    public readonly external_payment_id: string,
    public readonly amount: Money,
    public readonly status: PaymentStatus,
    public readonly failure_code: string | null,
    public readonly failure_reason: string | null,
    public readonly attempt_count: number,
    public readonly createdAt: Date,
    public readonly updatedAt: Date,
  ) {}
}

/**
 * Normalized payment-failure event that the recovery pipeline consumes.
 * See spec §15.
 */
export class PaymentFailedEvent {
  constructor(
    public readonly eventId: string,
    public readonly merchantId: string,
    public readonly paymentId: string,
    public readonly customerId: string,
    public readonly subscriptionId: string | undefined,
    public readonly externalPaymentId: string,
    public readonly amount: Money,
    public readonly failureCode: string | null,
    public readonly failureReason: string | null,
    public readonly providerFailureCategory: FailureCategory | null,
    public readonly occurredAt: Date,
  ) {}
}