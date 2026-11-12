import { and, eq, inArray, isNull, max } from 'drizzle-orm';
import { cards, lists, projectMembers, users } from '@/lib/db/schema';
import { MartrelloError } from '@/lib/errors';
import type { Actor } from '@/lib/access/actor';
import { assertAdmin, visibleProjectIds } from '@/lib/access/guard';
import { recordCardEvent } from './events';
import { POSITION_STEP } from './positions';
import { STAGES } from './stages';
import { getProjectByNameOrId } from './projects';
import type { Db, SyncDb } from './test-helpers';

export async function listMembers(
  db: Db,
  actor: Actor,
  projectId: string,
): Promise<Array<{ id: string; name: string; email: string; disabled: boolean }>> {
  const project = await getProjectByNameOrId(db, projectId, await visibleProjectIds(db, actor));
  const rows = await db
    .select({ id: users.id, name: users.name, email: users.email, disabledAt: users.disabledAt })
    .from(projectMembers)
    .innerJoin(users, eq(users.id, projectMembers.userId))
    .where(eq(projectMembers.projectId, project.id))
    .orderBy(users.name);
  return rows.map((r) => ({ id: r.id, name: r.name, email: r.email, disabled: r.disabledAt !== null }));
}

export async function addMember(db: Db, actor: Actor, projectId: string, userId: string): Promise<void> {
  assertAdmin(actor);
  const project = await getProjectByNameOrId(db, projectId);
  const user = (await db.select().from(users).where(eq(users.id, userId)))[0];
  if (!user) throw new MartrelloError('USER_NOT_FOUND', `Usuário '${userId}' não existe`);
  if (user.disabledAt !== null) {
    throw new MartrelloError('INVALID_INPUT', 'Não dá para adicionar uma conta desativada.');
  }
  db.transaction((tx) => {
    tx.insert(projectMembers)
      .values({ projectId: project.id, userId, addedAt: Date.now() })
      .onConflictDoNothing()
      .run();
  });
}

export async function removeMember(db: Db, actor: Actor, projectId: string, userId: string): Promise<void> {
  assertAdmin(actor);
  const project = await getProjectByNameOrId(db, projectId);
  const user = (await db.select().from(users).where(eq(users.id, userId)))[0];
  if (!user) throw new MartrelloError('USER_NOT_FOUND', `Usuário '${userId}' não existe`);
  if (user.role === 'admin') {
    throw new MartrelloError('FORBIDDEN', 'Não dá para remover o admin de um projeto.');
  }
  db.transaction((tx) => {
    unassignOpenCards(tx, actor, userId, project.id);
    tx.delete(projectMembers)
      .where(and(eq(projectMembers.projectId, project.id), eq(projectMembers.userId, userId)))
      .run();
  });
}

/**
 * Sends the user's active A fazer / Fazendo cards back to the end of their own project's
 * Backlog, unassigned, recording the assignee and stage events as `actor`. Done and archived
 * cards are untouched. Synchronous so it composes inside a caller's transaction.
 */
export function unassignOpenCards(db: SyncDb, actor: Actor, userId: string, projectId?: string): number {
  const stageName = (s: string) => STAGES.find((x) => x.stage === s)!.name;
  const email = db.select({ email: users.email }).from(users).where(eq(users.id, userId)).get()?.email ?? null;
  const filters = [
    eq(cards.assigneeId, userId),
    isNull(cards.archivedAt),
    inArray(lists.stage, ['todo', 'doing']),
  ];
  if (projectId) filters.push(eq(cards.projectId, projectId));
  const open = db
    .select({ id: cards.id, projectId: cards.projectId, stage: lists.stage })
    .from(cards)
    .innerJoin(lists, eq(lists.id, cards.listId))
    .where(and(...filters))
    .orderBy(cards.projectId, cards.position)
    .all();

  const backlogs = new Map<string, { listId: string; next: number }>();
  const now = Date.now();
  for (const c of open) {
    let b = backlogs.get(c.projectId);
    if (!b) {
      const list = db
        .select({ id: lists.id })
        .from(lists)
        .where(and(eq(lists.projectId, c.projectId), eq(lists.stage, 'backlog')))
        .get();
      if (!list) throw new MartrelloError('LIST_NOT_FOUND', "Projeto não tem a etapa 'backlog'");
      const top = db.select({ m: max(cards.position) }).from(cards).where(eq(cards.listId, list.id)).get()?.m;
      b = { listId: list.id, next: (top ?? 0) + POSITION_STEP };
      backlogs.set(c.projectId, b);
    }
    db.update(cards)
      .set({ listId: b.listId, position: b.next, assigneeId: null, completedAt: null, updatedAt: now })
      .where(eq(cards.id, c.id))
      .run();
    b.next += POSITION_STEP;
    recordCardEvent(db, { cardId: c.id, actor, type: 'assignee', from: email, to: null, at: now });
    recordCardEvent(db, { cardId: c.id, actor, type: 'stage', from: stageName(c.stage), to: 'Backlog', at: now });
  }
  return open.length;
}
