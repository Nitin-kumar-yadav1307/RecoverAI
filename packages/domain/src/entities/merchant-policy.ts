import { CommunicationChannel } from '../enums';

/**
 * Deterministic merchant policy. See spec §13, §20, §21.
 * Amount limits are stored as integer minor units (paise).
 */
export class MerchantPolicy {
  constructor(
    public readonly id: string,
    public readonly merchant_id: string,
    public readonly max_payment_retries: number,
    public readonly retry_cooldown_hours: number,
    public readonly max_messages_per_period: number,
    public readonly message_period_hours: number,
    public readonly max_discount_percent: number,
    public readonly max_automatic_recovery_amount_minor: number,
    public readonly human_escalation_amount_minor: number,
    public readonly respect_promise_to_pay: boolean,
    public readonly allowed_channels: CommunicationChannel[],
    public readonly createdAt: Date,
    public readonly updatedAt: Date,
  ) {}
}