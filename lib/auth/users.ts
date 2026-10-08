import { eq } from 'drizzle-orm';
import { ulid } from 'ulidx';
import { users } from '@/lib/db/schema';
import { MartrelloError } from '@/lib/errors';
import type { Db } from '@/lib/core/test-helpers';
import { hashPassword, verifyPassword } from './password';
import { deleteUserSessions, type SessionUser } from './sessions';

export const MIN_PASSWORD_LENGTH = 12;
export const MAX_PASSWORD_LENGTH = 1024;

export function normalizeUsername(raw: string): string {
  return raw.trim().toLowerCase();
}

export async function setUserPassword(
  db: Db,
  username: string,
  plain: string,
): Promise<{ id: string; username: string; created: boolean }> {
  const name = normalizeUsername(username);
  if (!name) throw new MartrelloError('INVALID_INPUT', 'username não pode ser vazio');
  if (plain.length < MIN_PASSWORD_LENGTH) {
    throw new MartrelloError('INVALID_INPUT', `senha precisa ter pelo menos ${MIN_PASSWORD_LENGTH} caracteres`);
  }
  if (plain.length > MAX_PASSWORD_LENGTH) {
    throw new MartrelloError('INVALID_INPUT', `senha pode ter no máximo ${MAX_PASSWORD_LENGTH} caracteres`);
  }

  const passwordHash = await hashPassword(plain);
  const existing = await db.select().from(users).where(eq(users.username, name)).get();
  if (existing) {
    await db.update(users).set({ passwordHash }).where(eq(users.id, existing.id));
    await deleteUserSessions(db, existing.id);
    return { id: existing.id, username: name, created: false };
  }

  const id = ulid();
  await db.insert(users).values({ id, username: name, passwordHash, createdAt: Date.now() });
  return { id, username: name, created: true };
}

// Verifying against a fixed hash when the user doesn't exist keeps response
// time indistinguishable from a wrong-password attempt.
let dummyHash: Promise<string> | null = null;
function getDummyHash(): Promise<string> {
  dummyHash ??= hashPassword('martrello-timing-equalizer');
  return dummyHash;
}

export async function authenticate(db: Db, username: string, plain: string): Promise<SessionUser | null> {
  if (plain.length > MAX_PASSWORD_LENGTH) return null;
  const name = normalizeUsername(username);
  const user = name ? await db.select().from(users).where(eq(users.username, name)).get() : undefined;
  if (!user) {
    await verifyPassword(await getDummyHash(), plain);
    return null;
  }
  const ok = await verifyPassword(user.passwordHash, plain);
  return ok ? { id: user.id, username: user.username } : null;
}
