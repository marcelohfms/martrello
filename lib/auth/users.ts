import { eq } from 'drizzle-orm';
import { ulid } from 'ulidx';
import { users, type Role, type User } from '@/lib/db/schema';
import { MartrelloError } from '@/lib/errors';
import type { Db } from '@/lib/core/test-helpers';
import { hashPassword, verifyPassword } from './password';
import { deleteUserSessions, type SessionUser } from './sessions';

export const MIN_PASSWORD_LENGTH = 12;
export const MAX_PASSWORD_LENGTH = 1024;

export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

export function assertPassword(plain: string): void {
  if (plain.length < MIN_PASSWORD_LENGTH) {
    throw new MartrelloError('INVALID_INPUT', `senha precisa ter pelo menos ${MIN_PASSWORD_LENGTH} caracteres`);
  }
  if (plain.length > MAX_PASSWORD_LENGTH) {
    throw new MartrelloError('INVALID_INPUT', `senha pode ter no máximo ${MAX_PASSWORD_LENGTH} caracteres`);
  }
}

export async function findUserByEmail(db: Db, email: string): Promise<User | undefined> {
  const normalized = normalizeEmail(email);
  if (!normalized) return undefined;
  return db.select().from(users).where(eq(users.email, normalized)).get();
}

export async function createUser(
  db: Db,
  input: { email: string; name: string; password: string; role?: Role },
): Promise<User> {
  const email = normalizeEmail(input.email);
  const name = input.name.trim();
  if (!email) throw new MartrelloError('INVALID_INPUT', 'e-mail não pode ser vazio');
  if (!name) throw new MartrelloError('INVALID_INPUT', 'nome não pode ser vazio');
  assertPassword(input.password);
  if (await findUserByEmail(db, email)) {
    throw new MartrelloError('EMAIL_TAKEN', `já existe um usuário com o e-mail ${email}`);
  }
  const passwordHash = await hashPassword(input.password);
  const row = { id: ulid(), email, name, passwordHash, role: input.role ?? 'member', createdAt: Date.now(), disabledAt: null };
  await db.insert(users).values(row);
  return row;
}

export async function setUserPassword(db: Db, userId: string, plain: string): Promise<void> {
  assertPassword(plain);
  const existing = await db.select().from(users).where(eq(users.id, userId)).get();
  if (!existing) throw new MartrelloError('USER_NOT_FOUND', `usuário ${userId} não encontrado`);
  const passwordHash = await hashPassword(plain);
  await db.update(users).set({ passwordHash }).where(eq(users.id, userId));
  await deleteUserSessions(db, userId);
}

// Verifying against a fixed hash when the user doesn't exist keeps response
// time indistinguishable from a wrong-password attempt.
let dummyHash: Promise<string> | null = null;
function getDummyHash(): Promise<string> {
  dummyHash ??= hashPassword('martrello-timing-equalizer');
  return dummyHash;
}

export async function authenticate(db: Db, email: string, plain: string): Promise<SessionUser | null> {
  if (plain.length > MAX_PASSWORD_LENGTH) return null;
  const user = await findUserByEmail(db, email);
  if (!user) {
    await verifyPassword(await getDummyHash(), plain);
    return null;
  }
  const ok = await verifyPassword(user.passwordHash, plain);
  if (!ok || user.disabledAt !== null) return null;
  return { id: user.id, email: user.email, name: user.name, role: user.role };
}
