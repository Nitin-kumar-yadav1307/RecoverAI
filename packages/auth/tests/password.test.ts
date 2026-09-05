import { hashPassword, verifyPassword } from '../src';

describe('password hashing (scrypt)', () => {
  it('hashes and verifies a correct password', async () => {
    const digest = await hashPassword('S3cure!p@ss');
    expect(digest).toMatch(/^scrypt\$[0-9a-f]{32}\$[0-9a-f]{128}$/);
    await expect(verifyPassword('S3cure!p@ss', digest)).resolves.toBe(true);
  });

  it('rejects an incorrect password', async () => {
    const digest = await hashPassword('correct');
    await expect(verifyPassword('wrong', digest)).resolves.toBe(false);
  });

  it('produces a unique salt per hash (same password, different digests)', async () => {
    const a = await hashPassword('same');
    const b = await hashPassword('same');
    expect(a).not.toBe(b);
  });

  it('returns false for malformed/unknown digests instead of throwing', async () => {
    await expect(verifyPassword('x', '')).resolves.toBe(false);
    await expect(verifyPassword('x', 'md5$abc$def')).resolves.toBe(false);
    await expect(verifyPassword('x', 'scrypt$zz$abc')).resolves.toBe(false); // invalid hex
    await expect(verifyPassword('x', 'garbage')).resolves.toBe(false);
  });
});