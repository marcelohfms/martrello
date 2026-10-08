import { describe, it, expect, beforeEach } from 'vitest';
import { makeTestDb, type Db } from '@/lib/core/test-helpers';
import { createRateLimiter } from './rate-limit';
import { setUserPassword } from './users';
import { attemptLogin } from './login';

const PW = 'a-very-long-password-1';
const WRONG = 'definitely-not-the-password';
const GENERIC = 'Usuário ou senha inválidos.';
const BLOCKED = 'Muitas tentativas. Tente de novo em 15 minutos.';

let db: Db;
let t: number;
let limiter: ReturnType<typeof createRateLimiter>;

beforeEach(async () => {
  db = makeTestDb().db;
  t = 1_000_000;
  limiter = createRateLimiter({ maxFailures: 5, windowMs: 15 * 60_000, blockMs: 15 * 60_000, now: () => t });
  await setUserPassword(db, 'marcelo', PW);
});

describe('attemptLogin', () => {
  it('returns the generic error for a wrong password', async () => {
    expect(await attemptLogin(db, limiter, '1.1.1.1', 'marcelo', WRONG)).toEqual({ ok: false, error: GENERIC });
  });

  it('logs in with the right password and resets the counter', async () => {
    for (let i = 0; i < 4; i++) await attemptLogin(db, limiter, '1.1.1.1', 'marcelo', WRONG);
    const ok = await attemptLogin(db, limiter, '1.1.1.1', 'marcelo', PW);
    expect(ok.ok).toBe(true);
    for (let i = 0; i < 4; i++) {
      expect(await attemptLogin(db, limiter, '1.1.1.1', 'marcelo', WRONG)).toEqual({ ok: false, error: GENERIC });
    }
  });

  it('blocks after 5 failed attempts, even with the right password', async () => {
    for (let i = 0; i < 5; i++) await attemptLogin(db, limiter, '1.1.1.1', 'marcelo', WRONG);
    expect(await attemptLogin(db, limiter, '1.1.1.1', 'marcelo', PW)).toEqual({ ok: false, error: BLOCKED });
  });

  it('concurrent attempts cannot exceed the limit', async () => {
    const results = await Promise.all(
      Array.from({ length: 8 }, () => attemptLogin(db, limiter, '1.1.1.1', 'marcelo', WRONG)),
    );
    const errors = results.map((r) => (r.ok ? 'ok' : r.error));
    expect(errors.filter((e) => e === GENERIC)).toHaveLength(5);
    expect(errors.filter((e) => e === BLOCKED)).toHaveLength(3);
  });
});
