import { createHash, randomBytes } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { sessions, users } from '@/lib/db/schema';
import type { Db } from '@/lib/core/test-helpers';

export type SessionUser = { id: string; username: string };

export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export async function createSession(
  db: Db,
  userId: string,
  now: number = Date.now(),
): Promise<{ token: string; expiresAt: number }> {
  const token = randomBytes(32).toString('base64url');
  const expiresAt = now + SESSION_TTL_MS;
  await db.insert(sessions).values({ idHash: hashToken(token), userId, createdAt: now, expiresAt });
  return { token, expiresAt };
}

export async function validateSession(
  db: Db,
  token: string | null | undefined,
  now: number = Date.now(),
): Promise<SessionUser | null> {
  if (!token) return null;
  const idHash = hashToken(token);
  const row = await db
    .select({ expiresAt: sessions.expiresAt, id: users.id, username: users.username })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(eq(sessions.idHash, idHash))
    .get();
  if (!row) return null;
  if (row.expiresAt <= now) {
    await db.delete(sessions).where(eq(sessions.idHash, idHash));
    return null;
  }
  return { id: row.id, username: row.username };
}

export async function deleteSession(db: Db, token: string | null | undefined): Promise<void> {
  if (!token) return;
  await db.delete(sessions).where(eq(sessions.idHash, hashToken(token)));
}

export async function deleteUserSessions(db: Db, userId: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.userId, userId));
}
