import {
  Money,
  MoneyCurrencyMismatchError,
} from '../src';

describe('Money (integer minor units)', () => {
  it('round-trips major <-> minor units', () => {
    expect(Money.fromMajorUnits(999).amount).toBe(99900);
    expect(Money.fromINRString('999').amount).toBe(99900);
    expect(Money.fromINRString('₹1,499').amount).toBe(149900);
  });

  it('performs integer arithmetic without float drift', () => {
    const a = Money.fromMajorUnits(0.1);
    const b = Money.fromMajorUnits(0.2);
    // 0.1 + 0.2 must equal 0.3 exactly (via minor units), never 0.30000000000000004
    expect(a.add(b).amount).toBe(Money.fromMajorUnits(0.3).amount);
    expect(a.add(b).toMajorUnits()).toBeCloseTo(0.3, 12);
  });

  it('multiplies by integer factor', () => {
    expect(Money.fromMajorUnits(100).multiply(3).amount).toBe(30000);
  });

  it('computes deterministic percentages (rounded)', () => {
    expect(Money.fromMajorUnits(100).percent(10).amount).toBe(1000); // ₹10
    expect(Money.fromMajorUnits(33).percent(50).amount).toBe(1650); // ₹16.50
  });

  it('rejects non-safe-integer minor units', () => {
    expect(() => Money.fromMinorUnits(Number.NaN)).toThrow();
    expect(() => Money.fromMinorUnits(1.5)).toThrow();
  });

  it('rejects cross-currency arithmetic', () => {
    const inr = Money.fromMajorUnits(10, 'INR');
    const usd = Money.fromMinorUnits(500, 'USD' as Money['currency']);
    expect(() => inr.add(usd)).toThrow(MoneyCurrencyMismatchError);
  });

  it('compares amounts correctly', () => {
    const ten = Money.fromMajorUnits(10);
    const twenty = Money.fromMajorUnits(20);
    expect(twenty.isGreaterThan(ten)).toBe(true);
    expect(ten.isLessThan(twenty)).toBe(true);
    expect(ten.equals(Money.fromMajorUnits(10))).toBe(true);
  });

  it('is immutable', () => {
    const m = Money.fromMajorUnits(10);
    const added = m.add(Money.fromMajorUnits(1));
    expect(m.amount).toBe(1000); // unchanged
    expect(added.amount).toBe(1100);
  });
});