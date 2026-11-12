'use server';

import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { getDb } from '@/lib/db/client';
import { MartrelloError } from '@/lib/errors';
import { acceptInvite, requestPasswordReset, resetPassword } from '@/lib/auth/tokens';
import { createSession } from '@/lib/auth/sessions';
import { SESSION_COOKIE, sessionCookieOptions } from '@/lib/auth/cookie';
import { resetLimiter } from '@/lib/auth/rate-limit';
import { clientIp } from '@/lib/auth/client-ip';
import { normalizeEmail } from '@/lib/auth/users';
import { appUrl, sendEmail } from '@/lib/email/mailer';
import { resetEmail } from '@/lib/email/templates';
import { FORGOT_MESSAGE, TOKEN_INVALID_MESSAGE, type FormState } from './messages';


function readPasswords(formData: FormData): { token: string; password: string } | { error: string } {
  const token = String(formData.get('token') ?? '');
  const password = String(formData.get('password') ?? '');
  const confirm = String(formData.get('confirm') ?? '');
  if (password !== confirm) return { error: 'As senhas não conferem.' };
  return { token, password };
}

function toError(e: unknown): FormState {
  if (e instanceof MartrelloError) {
    if (e.code === 'TOKEN_INVALID') return { error: TOKEN_INVALID_MESSAGE };
    if (e.code === 'INVALID_INPUT' || e.code === 'EMAIL_TAKEN') return { error: e.originalMessage };
  }
  throw e;
}

async function startSession(userId: string): Promise<never> {
  const { token, expiresAt } = await createSession(getDb(), userId);
  (await cookies()).set(SESSION_COOKIE, token, sessionCookieOptions(expiresAt));
  redirect('/');
}

export async function acceptInviteAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const read = readPasswords(formData);
  if ('error' in read) return { error: read.error };
  let userId: string;
  try {
    userId = (await acceptInvite(getDb(), read.token, read.password)).id;
  } catch (e) {
    return toError(e);
  }
  return startSession(userId);
}

export async function resetPasswordAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const read = readPasswords(formData);
  if ('error' in read) return { error: read.error };
  let userId: string;
  try {
    userId = (await resetPassword(getDb(), read.token, read.password)).id;
  } catch (e) {
    return toError(e);
  }
  return startSession(userId);
}

export async function forgotPasswordAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const email = normalizeEmail(String(formData.get('email') ?? ''));
  const done: FormState = { error: null, message: FORGOT_MESSAGE };
  if (!email) return done;

  const ipKey = `ip:${clientIp(await headers())}`;
  const emailKey = `email:${email}`;
  const limited = !resetLimiter.check(ipKey).allowed || !resetLimiter.check(emailKey).allowed;
  resetLimiter.recordFailure(ipKey);
  resetLimiter.recordFailure(emailKey);
  if (limited) return done;

  let token: string | null = null;
  try {
    token = await requestPasswordReset(getDb(), email);
  } catch (e) {
    console.error(`[auth] falha ao pedir redefinição: ${e instanceof Error ? e.message : String(e)}`);
    return done;
  }
  if (token) {
    // Not awaited: the Resend round trip must not reveal whether the account exists.
    void Promise.resolve()
      .then(() => sendEmail({ to: email, ...resetEmail({ link: appUrl(`/redefinir-senha/${token}`) }) }))
      .catch((e) => console.error(`[email] falha: ${e instanceof Error ? e.message : String(e)}`));
  }
  return done;
}
