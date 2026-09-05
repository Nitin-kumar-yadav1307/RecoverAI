import { randomBytes, scrypt as scryptCb, timingSafeEqual } from 'crypto';
import { promisify } from 'util';

const scrypt = promisify(scryptCb) as (
  pwd: string | Buffer,
  salt: string | Buffer,
  keylen: number,
) => Promise<Buffer>;

const KEYLEN = 64;
const SALT_HEX_LEN = 32; // 16 random bytes => 32 hex chars

export const PASSWORD_DIGEST = 'scrypt'; // for forward-compatible storage versioning

/**
 * Hash a plaintext password using scrypt with a per-password random salt.
 * Returns a self-describing string: `scrypt$<saltHex>$<hashHex>`.
 * Uses Node's native crypto (no external deps). Do NOT store plaintext.
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = await scrypt(password, salt, KEYLEN);
  return `${PASSWORD_DIGEST}$${salt.toString('hex')}$${derived.toString('hex')}`;
}

/**
 * Verify a plaintext password against a stored digest using a timing-safe
 * comparison. Returns false (never throws) on malformed/unknown digests.
 */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  if (typeof stored !== 'string') return false;
  const parts = stored.split('$');
  if (parts.length !== 3) return false;
  const [alg, saltHex, hashHex] = parts;
  if (alg !== PASSWORD_DIGEST) return false;
  if (!/^[0-9a-f]+$/.test(saltHex) || !/^[0-9a-f]+$/.test(hashHex)) return false;
  if (hashHex.length !== KEYLEN * 2) return false;

  const salt = Buffer.from(saltHex, 'hex');
  const expected = Buffer.from(hashHex, 'hex');
  const derived = await scrypt(password, salt, KEYLEN);
  return expected.length === derived.length && timingSafeEqual(expected, derived);
}