import { and, count, eq, isNull } from 'drizzle-orm';
import { mcpTokens, projectMembers, projects, sessions, users, type Role } from '@/lib/db/schema';
import { MartrelloError } from '@/lib/errors';
import type { Actor } from '@/lib/access/actor';
import { assertAdmin } from '@/lib/access/guard';
import { unassignOpenCards } from '@/lib/core/members';
import type { Db } from '@/lib/core/test-helpers';

export async function listUsers(
  db: Db,
  actor: Actor,
): Promise<Array<{ id: string; name: string; email: string; role: Role; disabledAt: number | null; projectCount: number }>> {
  assertAdmin(actor);
  const counts = await db
    .select({ userId: projectMembers.userId, c: count() })
    .from(projectMembers)
    .innerJoin(projects, eq(projects.id, projectMembers.projectId))
    .where(isNull(projects.archivedAt))
    .groupBy(projectMembers.userId);
  const byUser = new Map(counts.map((r) => [r.userId, Number(r.c)]));
  const rows = await db.select().from(users).orderBy(users.name);
  return rows.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    disabledAt: u.disabledAt,
    projectCount: byUser.get(u.id) ?? 0,
  }));
}

async function loadUser(db: Db, userId: string) {
  const user = (await db.select().from(users).where(eq(users.id, userId)))[0];
  if (!user) throw new MartrelloError('USER_NOT_FOUND', `Usuário '${userId}' não existe`);
  return user;
}

export async function deactivateUser(db: Db, actor: Actor, userId: string): Promise<void> {
  assertAdmin(actor);
  if (actor.kind === 'user' && actor.id === userId) {
    throw new MartrelloError('FORBIDDEN', 'Você não pode desativar a própria conta.');
  }
  const user = await loadUser(db, userId);
  if (user.role === 'admin') {
    throw new MartrelloError('FORBIDDEN', 'Não dá para desativar outro admin.');
  }
  const now = Date.now();
  db.transaction((tx) => {
    tx.update(users).set({ disabledAt: user.disabledAt ?? now }).where(eq(users.id, userId)).run();
    tx.delete(sessions).where(eq(sessions.userId, userId)).run();
    tx.update(mcpTokens)
      .set({ revokedAt: now })
      .where(and(eq(mcpTokens.userId, userId), isNull(mcpTokens.revokedAt)))
      .run();
    unassignOpenCards(tx, actor, userId);
    tx.delete(projectMembers).where(eq(projectMembers.userId, userId)).run();
  });
}

/** Clears `disabledAt` only: projects and tasks are not given back. */
export async function reactivateUser(db: Db, actor: Actor, userId: string): Promise<void> {
  assertAdmin(actor);
  await loadUser(db, userId);
  db.transaction((tx) => {
    tx.update(users).set({ disabledAt: null }).where(eq(users.id, userId)).run();
  });
}
