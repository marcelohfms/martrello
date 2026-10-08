import type { Db } from '@/lib/core/test-helpers';
import type { RateLimitCheck } from './rate-limit';
import type { SessionUser } from './sessions';
import { authenticate } from './users';

export type LoginResult = { ok: true; user: SessionUser } | { ok: false; error: string };

export async function attemptLogin(
  db: Db,
  limiter: { check(key: string): RateLimitCheck; recordFailure(key: string): void; reset(key: string): void },
  ip: string,
  username: string,
  password: string,
): Promise<LoginResult> {
  const gate = limiter.check(ip);
  if (!gate.allowed) {
    return { ok: false, error: `Muitas tentativas. Tente de novo em ${Math.ceil(gate.retryAfterMs / 60_000)} minutos.` };
  }

  // Reserve the attempt synchronously, before the slow argon2 verification, so
  // concurrent requests cannot all slip past check() before a failure is counted.
  limiter.recordFailure(ip);

  const user = await authenticate(db, username, password);
  if (!user) {
    return { ok: false, error: 'Usuário ou senha inválidos.' };
  }
  limiter.reset(ip);
  return { ok: true, user };
}
