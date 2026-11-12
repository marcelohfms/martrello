'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { getDb } from '@/lib/db/client';
import { requireActor } from '@/lib/auth/current-user';
import { createMcpToken, revokeMcpToken } from '@/lib/auth/mcp-tokens';
import { setUserPassword } from '@/lib/auth/users';
import { verifyCurrentPassword } from '@/lib/auth/password-check';
import { loginLimiter } from '@/lib/auth/rate-limit';
import { createSession } from '@/lib/auth/sessions';
import { SESSION_COOKIE, sessionCookieOptions } from '@/lib/auth/cookie';
import { validateTokenName, validatePasswordChange } from '@/lib/auth/admin-input';
import { toResult } from '@/lib/action-result';

export async function createMcpTokenAction(name: string): Promise<{ ok: true; token: string } | { error: string }> {
  const { user } = await requireActor();
  const v = validateTokenName(name);
  if ('error' in v) return v;
  try {
    const { token } = await createMcpToken(getDb(), user.id, v.name);
    revalidatePath('/conta');
    return { ok: true, token };
  } catch (e) {
    return toResult(e);
  }
}

export async function revokeMcpTokenAction(id: string): Promise<{ ok: true } | { error: string }> {
  const { user } = await requireActor();
  try {
    await revokeMcpToken(getDb(), user.id, id);
    revalidatePath('/conta');
    return { ok: true };
  } catch (e) {
    return toResult(e);
  }
}

export async function changePasswordAction(
  current: string,
  next: string,
  confirm: string,
): Promise<{ ok: true } | { error: string }> {
  const { user } = await requireActor();
  const v = validatePasswordChange(current, next, confirm);
  if ('error' in v) return v;
  try {
    const db = getDb();
    const check = await verifyCurrentPassword(db, loginLimiter, user.id, user.email, current);
    if (!check.ok) return { error: check.error };
    await setUserPassword(db, user.id, next); // ends every session of the user, including this one
    try {
      const { token, expiresAt } = await createSession(db, user.id);
      (await cookies()).set(SESSION_COOKIE, token, sessionCookieOptions(expiresAt));
    } catch {
      return { error: 'Senha alterada. Entre de novo com a senha nova.' };
    }
    revalidatePath('/conta');
    return { ok: true };
  } catch (e) {
    return toResult(e);
  }
}
