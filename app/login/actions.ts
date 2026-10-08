'use server';

import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { getDb } from '@/lib/db/client';
import { authenticate } from '@/lib/auth/users';
import { createSession, deleteSession } from '@/lib/auth/sessions';
import { SESSION_COOKIE, sessionCookieOptions } from '@/lib/auth/cookie';
import { loginLimiter } from '@/lib/auth/rate-limit';
import { clientIp } from '@/lib/auth/client-ip';

export type LoginState = { error: string | null };

export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const username = String(formData.get('username') ?? '');
  const password = String(formData.get('password') ?? '');
  const ip = clientIp(await headers());

  const gate = loginLimiter.check(ip);
  if (!gate.allowed) {
    const minutes = Math.ceil(gate.retryAfterMs / 60_000);
    return { error: `Muitas tentativas. Tente de novo em ${minutes} minutos.` };
  }

  const db = getDb();
  const user = await authenticate(db, username, password);
  if (!user) {
    loginLimiter.recordFailure(ip);
    return { error: 'Usuário ou senha inválidos.' };
  }

  loginLimiter.reset(ip);
  const { token, expiresAt } = await createSession(db, user.id);
  (await cookies()).set(SESSION_COOKIE, token, sessionCookieOptions(expiresAt));
  redirect('/');
}

export async function logoutAction(): Promise<void> {
  const store = await cookies();
  await deleteSession(getDb(), store.get(SESSION_COOKIE)?.value);
  store.delete(SESSION_COOKIE);
  redirect('/login');
}
