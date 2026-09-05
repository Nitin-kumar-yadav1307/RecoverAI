import {
  assertMerchantScope,
  MerchantIsolationError,
} from '../src';

describe('Merchant isolation (spec §41)', () => {
  it('passes when the resource belongs to the authenticated merchant', () => {
    const resource = { merchant_id: 'merch_1', id: 'x' };
    expect(() => assertMerchantScope('merch_1', resource, 'RecoveryCase')).not.toThrow();
  });

  it('throws when the resource belongs to another merchant', () => {
    const resource = { merchant_id: 'merch_2', id: 'x' };
    expect(() => assertMerchantScope('merch_1', resource, 'RecoveryCase')).toThrow(
      MerchantIsolationError,
    );
  });

  it('throws on a cross-merchant fetch attempt', () => {
    const resource = { merchant_id: 'merch_2', id: 'case_99' };
    expect(() => assertMerchantScope('merch_1', resource, 'AuditEvent')).toThrowError(
      /merchant isolation/i,
    );
  });
});