import { createHmac, timingSafeEqual } from 'crypto';

/**
 * Minimal, dependency-free HS256 JWT implementation built on Node crypto.
 * Sufficient for issuing and verifying signed merchant-session tokens.
 * We do NOT verify `alg` from the token header at verify time: we always
 * recompute the HMAC with HS256 and the configured secret, and only accept
 * tokens whose signature matches (algorithm-confusion safe).
 */

export interface JwtClaims {
  /** Subject - merchant id. */
  sub: string;
  /** Issuer. */
  iss: string;
  /** Issued-at (seconds). */
  iat: number;
  /** Expiry (seconds). */
  exp: number;
  /** Convenience claim mirroring sub for guards. */
  merchant_id?: string;
}

export interface VerifyOptions {
  issuer: string;
  maxAgeSeconds?: number;
}

const HEADER = { alg: 'HS256', typ: 'JWT' };

function b64url(input: Buffer | string): string {
  const buf = typeof input === 'string' ? Buffer.from(input, 'utf8') : input;
  return buf.toString('base64url');
}

function fromB64url(input: string): Buffer {
  return Buffer.from(input, 'base64url');
}

/**
 * Sign claims into a JWT. `merchant_id` is embedded both as `sub` and as a
 * top-level claim for convenient access from guards.
 */
export function signJwt(
  claims: Omit<JwtClaims, 'iat' | 'exp' | 'iss'>,
  secret: string,
  expiresInSeconds: number,
  issuer: string,
): string {
  const now = Math.floor(Date.now() / 1000);
  const payload: JwtClaims = {
    ...claims,
    sub: claims.sub,
    merchant_id: claims.sub,
    iss: issuer,
    iat: now,
    exp: now + expiresInSeconds,
  };
  const headerB64 = b64url(JSON.stringify(HEADER));
  const payloadB64 = b64url(JSON.stringify(payload));
  const sigInput = `${headerB64}.${payloadB64}`;
  const signature = createHmac('sha256', secret).update(sigInput).digest('base64url');
  return `${sigInput}.${signature}`;
}

/**
 * Verify a JWT and return its claims. Throws on invalid signature, expired
 * token, wrong issuer, or > maxAge. Returns the parsed payload otherwise.
 */
export function verifyJwt(token: string, secret: string, opts: VerifyOptions): JwtClaims {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('Malformed token');
  const [headerB64, payloadB64, providedSig] = parts;

  // Recompute signature with HS256 + provided secret (ignores attacker alg).
  const sigInput = `${headerB64}.${payloadB64}`;
  const expectedSig = createHmac('sha256', secret).update(sigInput).digest('base64url');

  if (!safeEqualStr(expectedSig, providedSig)) {
    throw new Error('Invalid token signature');
  }

  const header = JSON.parse(fromB64url(headerB64).toString('utf8'));
  if (header.alg !== 'HS256') throw new Error('Unsupported algorithm');

  const payload = JSON.parse(fromB64url(payloadB64).toString('utf8')) as JwtClaims;
  const now = Math.floor(Date.now() / 1000);

  if (!payload.exp || payload.exp <= now) throw new Error('Token expired');
  if (!payload.iat) throw new Error('Token missing issued-at');
  if (opts.issuer && payload.iss !== opts.issuer) throw new Error('Unexpected issuer');
  if (opts.maxAgeSeconds !== undefined && now - payload.iat > opts.maxAgeSeconds) {
    throw new Error('Token older than allowed max age');
  }

  return payload;
}

function safeEqualStr(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}