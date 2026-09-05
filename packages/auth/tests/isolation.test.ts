import {
  AuthenticatedPrincipal,
  authorizeTenantAccess,
  MerchantIsolationError,
  ownsResource,
  signJwt,
  verifyJwt,
} from '../src';

const SECRET = 'isolation-test-secret';
const ISSUER = 'recoverai';

function principal(merchantId: string): AuthenticatedPrincipal {
  const token = signJwt({ sub: merchantId }, SECRET, 3600, ISSUER);
  return { merchantId, claims: verifyJwt(token, SECRET, { issuer: ISSUER }) };
}

describe('merchant isolation authorization (spec §41)', () => {
  it('allows access to a resource owned by the principal', () => {
    const p = principal('merch_1');
    expect(() =>
      authorizeTenantAccess(p, { merchant_id: 'merch_1', id: 'case_1' }, 'RecoveryCase'),
    ).not.toThrow();
    expect(ownsResource(p, { merchant_id: 'merch_1' })).toBe(true);
  });

  it('blocks access to another merchant\'s resource', () => {
    const p = principal('merch_1');
    expect(() =>
      authorizeTenantAccess(p, { merchant_id: 'merch_2', id: 'case_9' }, 'RecoveryCase'),
    ).toThrow(MerchantIsolationError);
    expect(ownsResource(p, { merchant_id: 'merch_2' })).toBe(false);
  });

  it('never trusts a browser-supplied merchant_id over the principal', () => {
    // Simulates a malicious request body claiming merchant_2 while the token is merchant_1.
    const p = principal('merch_1');
    expect(() =>
      authorizeTenantAccess(p, { merchant_id: 'merch_2' }, 'RecoveryCase'),
    ).toThrow(MerchantIsolationError);
  });
});