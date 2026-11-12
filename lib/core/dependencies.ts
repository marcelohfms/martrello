// lib/core/dependencies.ts
import { and, eq, inArray } from 'drizzle-orm';
import { cardDependencies, cards, lists, type CardDependency } from '@/lib/db/schema';
import { MartrelloError } from '@/lib/errors';
import type { Actor } from '@/lib/access/actor';
import { loadVisibleCard } from '@/lib/access/guard';
import { recordCardEvent } from './events';
import type { Db } from './test-helpers';

export type DependencyInfo = { id: string; title: string; isDone: boolean };
export type BlockedStatus = { isBlocked: boolean; dependsOn: DependencyInfo[] };

// BFS from blockerCardId following "is blocked by" edges. If blockedCardId is
// reachable, it means blockerCardId already (transitively) depends on
// blockedCardId — so adding blockedCardId -> blockerCardId would close a loop.
async function wouldCreateCycle(db: Db, blockedCardId: string, blockerCardId: string): Promise<boolean> {
  const visited = new Set<string>();
  const queue = [blockerCardId];
  while (queue.length > 0) {
    const current = queue.shift()!;
    if (current === blockedCardId) return true;
    if (visited.has(current)) continue;
    visited.add(current);
    const rows = await db.select().from(cardDependencies).where(eq(cardDependencies.blockedCardId, current));
    for (const r of rows) queue.push(r.blockerCardId);
  }
  return false;
}

// Returns the subset of candidateIds that would NOT create a cycle if added
// as a new blocker of blockedCardId (i.e. addDependency(db, blockedCardId, candidateId)
// would succeed as far as cycle-detection is concerned).
export async function getCycleFreeCandidates(
  db: Db,
  blockedCardId: string,
  candidateIds: string[],
): Promise<string[]> {
  const safe: string[] = [];
  for (const candidateId of candidateIds) {
    if (!(await wouldCreateCycle(db, blockedCardId, candidateId))) {
      safe.push(candidateId);
    }
  }
  return safe;
}

export async function addDependency(
  db: Db,
  actor: Actor,
  blockedCardId: string,
  blockerCardId: string,
): Promise<CardDependency> {
  if (blockedCardId === blockerCardId) {
    throw new MartrelloError('INVALID_INPUT', 'Um card não pode depender de si mesmo');
  }
  const blocked = await loadVisibleCard(db, actor, blockedCardId);
  const blocker = await loadVisibleCard(db, actor, blockerCardId);
  if (blocked.projectId !== blocker.projectId) {
    throw new MartrelloError('CROSS_PROJECT_DEPENDENCY', 'Dependências só podem ser criadas entre cards do mesmo projeto');
  }
  if (await wouldCreateCycle(db, blockedCardId, blockerCardId)) {
    throw new MartrelloError('CYCLE_DETECTED', 'Essa dependência criaria um ciclo');
  }
  db.transaction((tx) => {
    const res = tx.insert(cardDependencies).values({ blockedCardId, blockerCardId, createdAt: Date.now() }).onConflictDoNothing().run();
    if (res.changes > 0) recordCardEvent(tx, { cardId: blockedCardId, actor, type: 'dependency_added', to: blockerCardId });
  });
  return (await db
    .select()
    .from(cardDependencies)
    .where(and(eq(cardDependencies.blockedCardId, blockedCardId), eq(cardDependencies.blockerCardId, blockerCardId))))[0];
}

export async function removeDependency(db: Db, actor: Actor, blockedCardId: string, blockerCardId: string): Promise<void> {
  await loadVisibleCard(db, actor, blockedCardId);
  db.transaction((tx) => {
    const res = tx
      .delete(cardDependencies)
      .where(and(eq(cardDependencies.blockedCardId, blockedCardId), eq(cardDependencies.blockerCardId, blockerCardId)))
      .run();
    if (res.changes > 0) recordCardEvent(tx, { cardId: blockedCardId, actor, type: 'dependency_removed', from: blockerCardId });
  });
}

export async function getBlockedStatuses(db: Db, cardIds: string[]): Promise<Map<string, BlockedStatus>> {
  const result = new Map<string, BlockedStatus>(cardIds.map((id) => [id, { isBlocked: false, dependsOn: [] }]));
  if (cardIds.length === 0) return result;

  const depRows = await db.select().from(cardDependencies).where(inArray(cardDependencies.blockedCardId, cardIds));
  if (depRows.length === 0) return result;

  const blockerIds = [...new Set(depRows.map((r) => r.blockerCardId))];
  const blockerCards = await db.select().from(cards).where(inArray(cards.id, blockerIds));
  const blockerById = new Map(blockerCards.map((c) => [c.id, c]));

  // "Done" = archived or sitting in the project's Feito stage.
  const listIds = [...new Set(blockerCards.map((c) => c.listId))];
  const doneListIds = new Set(
    (listIds.length ? await db.select().from(lists).where(and(inArray(lists.id, listIds), eq(lists.stage, 'done'))) : [])
      .map((l) => l.id),
  );

  for (const cardId of cardIds) {
    const deps = depRows.filter((d) => d.blockedCardId === cardId);
    if (deps.length === 0) continue;
    const dependsOn: DependencyInfo[] = deps.map((d) => {
      const blocker = blockerById.get(d.blockerCardId);
      if (!blocker) return { id: d.blockerCardId, title: '(removido)', isDone: true };
      const isDone = blocker.archivedAt != null || doneListIds.has(blocker.listId);
      return { id: blocker.id, title: blocker.title, isDone };
    });
    result.set(cardId, { isBlocked: dependsOn.some((d) => !d.isDone), dependsOn });
  }
  return result;
}
