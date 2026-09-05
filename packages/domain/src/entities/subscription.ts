import { SubscriptionStatus } from '../enums';
import { Money } from '../money';

export class Subscription {
  constructor(
    public readonly id: string,
    public readonly merchant_id: string,
    public readonly customer_id: string,
    public readonly external_subscription_id: string,
    public readonly amount: Money,
    public readonly billing_interval: string,
    public readonly status: SubscriptionStatus,
    public readonly next_billing_at: Date | null,
    public readonly createdAt: Date,
    public readonly updatedAt: Date,
  ) {}
}