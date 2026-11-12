import type { Db } from '@/lib/core/test-helpers';
import type { RateLimitCheck } from './rate-limit';
import { authenticate } from './users';

type Limiter = { check(key: string): RateLimitCheck; recordFailure(key: string): void; reset(key: string): void };

/** Rate-limited check of the signed-in user's current password (same pattern as `attemptLogin`). */
export async function verifyCurrentPassword(
  db: Db,
  limiter: Limiter,
  userId: string,
  email: string,
  plain: string,
  auth: typeof authenticate = authenticate,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const key = `user:${userId}`;
  const gate = limiter.check(key);
  if (!gate.allowed) {
    return { ok: false, error: `Muitas tentativas. Tente de novo em ${Math.ceil(gate.retryAfterMs / 60_000)} minutos.` };
  }
  limiter.recordFailure(key); // reserve before the slow argon2 verification
  if (!(await auth(db, email, plain))) return { ok: false, error: 'Senha atual incorreta.' };
  limiter.reset(key);
  return { ok: true };
}
