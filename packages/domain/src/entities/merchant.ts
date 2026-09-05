import { CommunicationChannel, Currency, MerchantStatus } from '../enums';

/** A merchant operating the RecoverAI system. */
export class Merchant {
  constructor(
    public readonly id: string,
    public readonly name: string,
    public readonly email: string,
    public readonly currency: Currency,
    public readonly timezone: string,
    public readonly status: MerchantStatus,
    public readonly createdAt: Date,
    public readonly updatedAt: Date,
  ) {}
}

/** Default policy limits applied when a merchant has no custom policy rows. */
export const DEFAULT_MERCHANT_POLICY = {
  maxPaymentRetries: 3,
  retryCooldownHours: 12,
  maxMessagesPerPeriod: 2,
  messagePeriodHours: 168,
  maxDiscountPercent: 0,
  maxAutomaticRecoveryAmountMinor: 20000 * 100, // ₹20,000 in paise
  humanEscalationAmountMinor: 20000 * 100, // ₹20,000 in paise
  respectPromiseToPay: true,
  allowedChannels: [CommunicationChannel.EMAIL, CommunicationChannel.WHATSAPP],
} as const;