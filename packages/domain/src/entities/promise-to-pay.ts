import { PromiseStatus } from '../enums';
import { Money } from '../money';

/**
 * Structured Promise-to-Pay memory (spec §7, §25, §26).
 * The agent must suppress unnecessary outreach before promised_for.
 */
export class PromiseToPay {
  constructor(
    public readonly id: string,
    public readonly merchant_id: string,
    public readonly customer_id: string,
    public readonly recovery_case_id: string | null,
    public readonly amount: Money | null,
    public readonly promised_at: Date,
    public readonly promised_for: Date,
    public readonly status: PromiseStatus,
    public readonly source: string,
    public readonly confidence: number,
    public readonly created_at: Date,
    public readonly updated_at: Date,
  ) {}

  /** True while the promise is active (i.e. not yet fulfilled/broken/cancelled/expired). */
  isActive(): boolean {
    return this.status === PromiseStatus.ACTIVE;
  }

  /** Should outreach be suppressed right now? */
  suppressesOutreach(now: Date): boolean {
    return this.isActive() && now < this.promised_for;
  }
}