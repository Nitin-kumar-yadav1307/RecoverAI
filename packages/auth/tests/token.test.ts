import { signJwt, verifyJwt } from '../src';

const SECRET = 'unit-test-secret-0123456789';
const ISSUER = 'recoverai';

describe('JWT (HS256, zero-dep)', () => {
  it('signs and verifies a token', () => {
    const token = signJwt({ sub: 'merch_1' }, SECRET, 3600, ISSUER);
    const claims = verifyJwt(token, SECRET, { issuer: ISSUER });
    expect(claims.sub).toBe('merch_1');
    expect(claims.merchant_id).toBe('merch_1');
    expect(claims.iss).toBe(ISSUER);
    expect(claims.exp).toBeGreaterThan(claims.iat);
  });

  it('reads the merchant_id claim for guards', () => {
    const token = signJwt({ sub: 'merch_2' }, SECRET, 3600, ISSUER);
    const claims = verifyJwt(token, SECRET, { issuer: ISSUER });
    expect(claims.merchant_id).toBe('merch_2');
  });

  it('rejects a tampered payload', () => {
    const token = signJwt({ sub: 'merch_1' }, SECRET, 3600, ISSUER);
    const [h, , s] = token.split('.');
    const badPayload = Buffer.from(JSON.stringify({ sub: 'merch_9', merchant_id: 'merch_9' })).toString('base64url');
    expect(() => verifyJwt(`${h}.${badPayload}.${s}`, SECRET, { issuer: ISSUER })).toThrow(
      /signature/i,
    );
  });

  it('rejects a token signed with a different secret', () => {
    const token = signJwt({ sub: 'merch_1' }, 'other-secret', 3600, ISSUER);
    expect(() => verifyJwt(token, SECRET, { issuer: ISSUER })).toThrow(/signature/i);
  });

  it('rejects an expired token', () => {
    const token = signJwt({ sub: 'merch_1' }, SECRET, -10, ISSUER); // already expired
    expect(() => verifyJwt(token, SECRET, { issuer: ISSUER })).toThrow(/expired/i);
  });

  it('rejects a token from an unexpected issuer', () => {
    const token = signJwt({ sub: 'merch_1' }, SECRET, 3600, 'attacker-iss');
    expect(() => verifyJwt(token, SECRET, { issuer: ISSUER })).toThrow(/issuer/i);
  });

  it('rejects a malformed token', () => {
    expect(() => verifyJwt('not.a.token', SECRET, { issuer: ISSUER })).toThrow();
  });
});