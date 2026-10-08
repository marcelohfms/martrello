import { describe, it, expect } from 'vitest';
import { hashPassword, verifyPassword } from './password';

describe('password', () => {
  it('hashes with argon2id and the configured parameters', async () => {
    const h = await hashPassword('correct horse battery staple');
    expect(h).not.toContain('correct horse');
    expect(h.startsWith('$argon2id$')).toBe(true);
    expect(h).toContain('m=19456,t=2,p=1');
  });

  it('verifies the right password', async () => {
    const h = await hashPassword('correct horse battery staple');
    expect(await verifyPassword(h, 'correct horse battery staple')).toBe(true);
  });

  it('rejects a wrong password', async () => {
    const h = await hashPassword('correct horse battery staple');
    expect(await verifyPassword(h, 'wrong horse battery staple')).toBe(false);
  });

  it('returns false (does not throw) for a malformed hash', async () => {
    expect(await verifyPassword('not-a-hash', 'whatever')).toBe(false);
  });
});
