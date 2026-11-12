import { describe, expect, it, vi } from 'vitest';
import { createRateLimiter } from './rate-limit';
import { verifyCurrentPassword } from './password-check';
import type { Db } from '@/lib/core/test-helpers';

const db = {} as Db;
const user = { id: 'u1', email: 'a@b.c', name: 'A', role: 'member' as const };

function limiter() {
  return createRateLimiter({ maxFailures: 5, windowMs: 900_000, blockMs: 900_000 });
}

describe('verifyCurrentPassword', () => {
  it('blocks the 6th wrong attempt without running authenticate', async () => {
    const l = limiter();
    const auth = vi.fn().mockResolvedValue(null);
    for (let i = 0; i < 5; i++) {
      expect(await verifyCurrentPassword(db, l, 'u1', 'a@b.c', 'x', auth)).toEqual({ ok: false, error: 'Senha atual incorreta.' });
    }
    const r = await verifyCurrentPassword(db, l, 'u1', 'a@b.c', 'x', auth);
    expect(r).toEqual({ ok: false, error: expect.stringMatching(/^Muitas tentativas\. Tente de novo em \d+ minutos\.$/) });
    expect(auth).toHaveBeenCalledTimes(5);
  });
  it('resets the counter on success', async () => {
    const l = limiter();
    const auth = vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(user);
    await verifyCurrentPassword(db, l, 'u1', 'a@b.c', 'x', auth);
    expect(await verifyCurrentPassword(db, l, 'u1', 'a@b.c', 'ok', auth)).toEqual({ ok: true });
    expect(l.check('user:u1')).toEqual({ allowed: true });
  });
});
