import { randomBytes } from 'node:crypto';
import { and, eq, gt, isNull } from 'drizzle-orm';
import { authTokens, users } from '@/lib/db/schema';
import { MartrelloError } from '@/lib/errors';
import type { Db } from '@/lib/core/test-helpers';
import type { Actor } from '@/lib/access/actor';
import { assertAdmin } from '@/lib/access/guard';
import { hashToken, type SessionUser } from './sessions';
import { assertPassword, createUser, findUserByEmail, normalizeEmail, setUserPassword } from './users';

export const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const RESET_TTL_MS = 60 * 60 * 1000;

type Kind = 'invite' | 'reset';

const invalid = () => new MartrelloError('TOKEN_INVALID', 'Este link não é mais válido. Peça um novo.');

function newToken(): { token: string; idHash: string } {
  const token = randomBytes(32).toString('base64url');
  return { token, idHash: hashToken(token) };
}

async function revokeOpen(db: Db, kind: Kind, where: ReturnType<typeof eq>, now: number): Promise<void> {
  await db
    .update(authTokens)
    .set({ revokedAt: now })
    .where(and(eq(authTokens.kind, kind), where, isNull(authTokens.usedAt), isNull(authTokens.revokedAt)));
}

async function loadLive(db: Db, kind: Kind, token: string, now: number) {
  if (!token) return undefined;
  return db
    .select()
    .from(authTokens)
    .where(
      and(
        eq(authTokens.idHash, hashToken(token)),
        eq(authTokens.kind, kind),
        isNull(authTokens.usedAt),
        isNull(authTokens.revokedAt),
        gt(authTokens.expiresAt, now),
      ),
    )
    .get();
}

/** Atomically consumes the token; throws TOKEN_INVALID if someone else got there first. */
async function claim(db: Db, kind: Kind, idHash: string, now: number): Promise<void> {
  const rows = await db
    .update(authTokens)
    .set({ usedAt: now })
    .where(
      and(
        eq(authTokens.idHash, idHash),
        eq(authTokens.kind, kind),
        isNull(authTokens.usedAt),
        isNull(authTokens.revokedAt),
        gt(authTokens.expiresAt, now),
      ),
    )
    .returning({ id: authTokens.idHash });
  if (rows.length === 0) throw invalid();
}

async function issueInvite(db: Db, actor: Actor, email: string, name: string, now: number) {
  const { token, idHash } = newToken();
  await revokeOpen(db, 'invite', eq(authTokens.email, email), now);
  await db.insert(authTokens).values({
    idHash,
    kind: 'invite',
    email,
    name,
    userId: null,
    createdBy: actor.kind === 'user' ? actor.id : null,
    createdAt: now,
    expiresAt: now + INVITE_TTL_MS,
  });
  return { inviteId: idHash, token };
}

export async function createInvite(
  db: Db,
  actor: Actor,
  input: { email: string; name: string },
  now: number = Date.now(),
): Promise<{ inviteId: string; token: string }> {
  assertAdmin(actor);
  const email = normalizeEmail(input.email);
  const name = input.name.trim();
  if (!email) throw new MartrelloError('INVALID_INPUT', 'e-mail não pode ser vazio');
  if (!name) throw new MartrelloError('INVALID_INPUT', 'nome não pode ser vazio');
  if (await findUserByEmail(db, email)) {
    throw new MartrelloError('EMAIL_TAKEN', `já existe um usuário com o e-mail ${email}`);
  }
  return issueInvite(db, actor, email, name, now);
}

export async function resendInvite(
  db: Db,
  actor: Actor,
  inviteId: string,
  now: number = Date.now(),
): Promise<{ inviteId: string; token: string }> {
  assertAdmin(actor);
  const row = await db
    .select()
    .from(authTokens)
    .where(and(eq(authTokens.idHash, inviteId), eq(authTokens.kind, 'invite'), isNull(authTokens.usedAt), isNull(authTokens.revokedAt)))
    .get();
  if (!row) throw new MartrelloError('TOKEN_INVALID', 'Convite não encontrado.');
  if (await findUserByEmail(db, row.email)) {
    throw new MartrelloError('EMAIL_TAKEN', `já existe um usuário com o e-mail ${row.email}`);
  }
  return issueInvite(db, actor, row.email, row.name ?? '', now);
}

export async function cancelInvite(db: Db, actor: Actor, inviteId: string, now: number = Date.now()): Promise<void> {
  assertAdmin(actor);
  await revokeOpen(db, 'invite', eq(authTokens.idHash, inviteId), now);
}

export async function listPendingInvites(
  db: Db,
  actor: Actor,
  now: number = Date.now(),
): Promise<Array<{ inviteId: string; email: string; name: string; createdAt: number; expiresAt: number }>> {
  assertAdmin(actor);
  const rows = await db
    .select()
    .from(authTokens)
    .where(
      and(eq(authTokens.kind, 'invite'), isNull(authTokens.usedAt), isNull(authTokens.revokedAt), gt(authTokens.expiresAt, now)),
    );
  return rows
    .map((r) => ({ inviteId: r.idHash, email: r.email, name: r.name ?? '', createdAt: r.createdAt, expiresAt: r.expiresAt }))
    .sort((a, b) => b.createdAt - a.createdAt);
}

export async function peekToken(
  db: Db,
  kind: Kind,
  token: string,
  now: number = Date.now(),
): Promise<{ email: string; name: string | null } | null> {
  const row = await loadLive(db, kind, token, now);
  return row ? { email: row.email, name: row.name } : null;
}

export async function acceptInvite(
  db: Db,
  token: string,
  password: string,
  now: number = Date.now(),
): Promise<SessionUser> {
  const row = await loadLive(db, 'invite', token, now);
  if (!row) throw invalid();
  // Cheap validation first so a failure never consumes the invite.
  assertPassword(password);
  if (await findUserByEmail(db, row.email)) {
    throw new MartrelloError('EMAIL_TAKEN', `já existe um usuário com o e-mail ${row.email}`);
  }
  await claim(db, 'invite', row.idHash, now);
  let user;
  try {
    user = await createUser(db, { email: row.email, name: row.name ?? row.email, password, role: 'member' });
  } catch (e) {
    if (e instanceof Error && /UNIQUE/i.test(e.message)) {
      throw new MartrelloError('EMAIL_TAKEN', `já existe um usuário com o e-mail ${row.email}`);
    }
    throw e;
  }
  return { id: user.id, email: user.email, name: user.name, role: user.role };
}

export async function requestPasswordReset(
  db: Db,
  email: string,
  now: number = Date.now(),
): Promise<string | null> {
  const user = await findUserByEmail(db, email);
  if (!user || user.disabledAt !== null) return null;
  await revokeOpen(db, 'reset', eq(authTokens.userId, user.id), now);
  const { token, idHash } = newToken();
  await db.insert(authTokens).values({
    idHash,
    kind: 'reset',
    email: user.email,
    name: null,
    userId: user.id,
    createdBy: null,
    createdAt: now,
    expiresAt: now + RESET_TTL_MS,
  });
  return token;
}

export async function resetPassword(
  db: Db,
  token: string,
  password: string,
  now: number = Date.now(),
): Promise<SessionUser> {
  const row = await loadLive(db, 'reset', token, now);
  if (!row || !row.userId) throw invalid();
  const user = await db.select().from(users).where(eq(users.id, row.userId)).get();
  if (!user || user.disabledAt !== null) throw invalid();
  // Validate first: a too-short password throws and leaves the token usable.
  assertPassword(password);
  await claim(db, 'reset', row.idHash, now);
  await setUserPassword(db, user.id, password);
  return { id: user.id, email: user.email, name: user.name, role: user.role };
}
