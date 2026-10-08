'use server';

import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { getDb } from '@/lib/db/client';
import { attemptLogin } from '@/lib/auth/login';
import { createSession, deleteSession } from '@/lib/auth/sessions';
import { SESSION_COOKIE, sessionCookieOptions } from '@/lib/auth/cookie';
import { loginLimiter } from '@/lib/auth/rate-limit';
import { clientIp } from '@/lib/auth/client-ip';

export type LoginState = { error: string | null };

export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const username = String(formData.get('username') ?? '');
  const password = String(formData.get('password') ?? '');
  const ip = clientIp(await headers());

  const db = getDb();
  const result = await attemptLogin(db, loginLimiter, ip, username, password);
  if (!result.ok) return { error: result.error };

  const { token, expiresAt } = await createSession(db, result.user.id);
  (await cookies()).set(SESSION_COOKIE, token, sessionCookieOptions(expiresAt));
  redirect('/');
}

export async function logoutAction(): Promise<void> {
  const store = await cookies();
  await deleteSession(getDb(), store.get(SESSION_COOKIE)?.value);
  store.delete(SESSION_COOKIE);
  redirect('/login');
}
