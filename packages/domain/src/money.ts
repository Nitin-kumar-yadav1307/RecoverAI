import { Currency } from './enums';
import { DomainError, MoneyCurrencyMismatchError } from './errors';

const DEFAULT_CURRENCY: Currency = 'INR';

/** Number of minor units (paise) per major unit (rupee) for the supported currency. */
const MINOR_UNITS_PER_MAJOR: Record<Currency, number> = { INR: 100 };

/**
 * Immutable money value stored as an INTEGER number of minor units (e.g. paise).
 *
 * Financial safety rule (spec §43): all money arithmetic MUST be integer-based.
 * No floating point representation of money may be stored or computed.
 */
export class Money {
  /** Integer minor units (e.g. paise). */
  public readonly amount: number;
  public readonly currency: Currency;

  private constructor(amountMinor: number, currency: Currency) {
    this.amount = amountMinor;
    this.currency = currency;
  }

  /** Create from an exact integer count of minor units. This is the canonical constructor. */
  static fromMinorUnits(amountMinor: number, currency: Currency = DEFAULT_CURRENCY): Money {
    if (!Number.isSafeInteger(amountMinor)) {
      throw new DomainError(`Money minor units must be a safe integer, got ${amountMinor}.`);
    }
    return new Money(amountMinor, currency);
  }

  /**
   * Create from major units (e.g. rupees). Accepts a decimal and converts via
   * rounding to integer minor units to avoid float drift.
   */
  static fromMajorUnits(amountMajor: number, currency: Currency = DEFAULT_CURRENCY): Money {
    if (!Number.isFinite(amountMajor)) {
      throw new DomainError(`Money major units must be finite, got ${amountMajor}.`);
    }
    const perMajor = MINOR_UNITS_PER_MAJOR[currency];
    // round to nearest minor unit to mask binary float imprecision
    const minor = Math.round(amountMajor * perMajor);
    return Money.fromMinorUnits(minor, currency);
  }

  /** Convert an INR string like "999" or "₹1,499" to Money. */
  static fromINRString(amount: string | number): Money {
    if (typeof amount === 'number') return Money.fromMajorUnits(amount, 'INR');
    const cleaned = amount.replace(/[₹,\s]/g, '');
    const major = Number(cleaned);
    if (!Number.isFinite(major)) {
      throw new DomainError(`Invalid INR amount string: ${amount}.`);
    }
    return Money.fromMajorUnits(major, 'INR');
  }

  add(other: Money): Money {
    this.assertSameCurrency(other);
    return Money.fromMinorUnits(this.amount + other.amount, this.currency);
  }

  subtract(other: Money): Money {
    this.assertSameCurrency(other);
    return Money.fromMinorUnits(this.amount - other.amount, this.currency);
  }

  /** Multiply by an integer factor. */
  multiply(factor: number): Money {
    if (!Number.isSafeInteger(factor)) {
      throw new DomainError(`Money multiplier must be a safe integer, got ${factor}.`);
    }
    return Money.fromMinorUnits(this.amount * factor, this.currency);
  }

  /** Percentage arithmetic, e.g. 10 -> 10%. Rounded to nearest minor unit. */
  percent(pct: number): Money {
    if (!Number.isFinite(pct)) {
      throw new DomainError(`Percentage must be finite, got ${pct}.`);
    }
    const minor = Math.round((this.amount * pct) / 100);
    return Money.fromMinorUnits(minor, this.currency);
  }

  isGreaterThan(other: Money): boolean {
    this.assertSameCurrency(other);
    return this.amount > other.amount;
  }

  isGreaterThanOrEqual(other: Money): boolean {
    this.assertSameCurrency(other);
    return this.amount >= other.amount;
  }

  isLessThan(other: Money): boolean {
    this.assertSameCurrency(other);
    return this.amount < other.amount;
  }

  equals(other: Money): boolean {
    if (this.currency !== other.currency) return false;
    return this.amount === other.amount;
  }

  isZero(): boolean {
    return this.amount === 0;
  }

  isPositive(): boolean {
    return this.amount > 0;
  }

  isNegative(): boolean {
    return this.amount < 0;
  }

  /** Total major units as a float. ONLY for display purposes, never for arithmetic. */
  toMajorUnits(): number {
    return this.amount / MINOR_UNITS_PER_MAJOR[this.currency];
  }

  /** Human friendly INR display, e.g. "₹1,499". For display only. */
  toINRString(): string {
    return `₹${this.toMajorUnits().toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
  }

  private assertSameCurrency(other: Money): void {
    if (this.currency !== other.currency) {
      throw new MoneyCurrencyMismatchError(
        `Cannot combine ${this.currency} and ${other.currency}.`,
      );
    }
  }
}