import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getDb } from '@/lib/db/client';
import { SESSION_COOKIE } from './cookie';
import { toActor, type Actor } from '@/lib/access/actor';
import { validateSession, type SessionUser } from './sessions';

export async function getCurrentUser(): Promise<SessionUser | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return validateSession(getDb(), token);
}

export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  return user;
}

export async function requireActor(): Promise<{ user: SessionUser; actor: Actor }> {
  const user = await requireUser();
  return { user, actor: toActor(user) };
}

export async function requireAdmin(): Promise<{ user: SessionUser; actor: Actor }> {
  const res = await requireActor();
  if (res.user.role !== 'admin') redirect('/');
  return res;
}
