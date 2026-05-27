// lib/core/lists.ts
import { and, count, eq, max } from 'drizzle-orm';
import { ulid } from 'ulidx';
import { lists, cards, type List } from '@/lib/db/schema';
import { MartrelloError, suggestClosest } from '@/lib/errors';
import { POSITION_STEP, renumber } from './positions';
import type { Db } from './test-helpers';

export async function createList(db: Db, projectId: string, name: string, position?: number): Promise<List> {
  const maxPos = (await db.select({ m: max(lists.position) }).from(lists).where(eq(lists.projectId, projectId)))[0]?.m ?? 0;
  const id = ulid();
  await db.insert(lists).values({
    id,
    projectId,
    name,
    position: position ?? maxPos + POSITION_STEP,
    createdAt: Date.now(),
  });
  return (await db.select().from(lists).where(eq(lists.id, id)))[0];
}

export async function getListByNameOrId(db: Db, projectId: string, nameOrId: string): Promise<List> {
  const found =
    (await db.select().from(lists).where(and(eq(lists.id, nameOrId), eq(lists.projectId, projectId))))[0] ??
    (await db.select().from(lists).where(and(eq(lists.name, nameOrId), eq(lists.projectId, projectId))))[0];
  if (!found) {
    const candidates = await db.select({ name: lists.name }).from(lists).where(eq(lists.projectId, projectId));
    throw new MartrelloError(
      'LIST_NOT_FOUND',
      `Lista '${nameOrId}' não existe nesse projeto`,
      suggestClosest(nameOrId, candidates.map((c) => c.name)),
    );
  }
  return found;
}

export async function renameList(db: Db, id: string, newName: string): Promise<List> {
  const found = (await db.select().from(lists).where(eq(lists.id, id)))[0];
  if (!found) throw new MartrelloError('LIST_NOT_FOUND', `Lista ${id} não existe`);
  await db.update(lists).set({ name: newName }).where(eq(lists.id, id));
  return { ...found, name: newName };
}

export async function deleteList(db: Db, id: string, opts: { force?: boolean } = {}): Promise<void> {
  const found = (await db.select().from(lists).where(eq(lists.id, id)))[0];
  if (!found) throw new MartrelloError('LIST_NOT_FOUND', `Lista ${id} não existe`);
  const cardCount = (await db.select({ c: count() }).from(cards).where(eq(cards.listId, id)))[0]?.c ?? 0;
  if (Number(cardCount) > 0 && !opts.force) {
    throw new MartrelloError('LIST_NOT_EMPTY', `Lista tem ${cardCount} card(s); use force=true pra deletar mesmo assim`);
  }
  await db.delete(lists).where(eq(lists.id, id));
}

export async function reorderLists(db: Db, projectId: string, orderedIds: string[]): Promise<void> {
  await db.transaction((tx) => {
    for (const r of renumber(orderedIds)) {
      tx.update(lists).set({ position: r.position }).where(and(eq(lists.id, r.id), eq(lists.projectId, projectId))).run();
    }
  });
}
