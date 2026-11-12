// lib/core/lists.ts
import { and, eq } from 'drizzle-orm';
import { lists, type List } from '@/lib/db/schema';
import { MartrelloError, suggestClosest } from '@/lib/errors';
import type { Db } from './test-helpers';

const fixed = () => new MartrelloError('LISTS_ARE_FIXED', 'As listas são fixas: Backlog, A fazer, Fazendo e Feito');

export async function createList(_db: Db, _projectId: string, _name: string, _position?: number): Promise<List> {
  throw fixed();
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

export async function renameList(_db: Db, _id: string, _newName: string): Promise<List> {
  throw fixed();
}

export async function deleteList(_db: Db, _id: string, _opts: { force?: boolean } = {}): Promise<void> {
  throw fixed();
}

export async function reorderLists(_db: Db, _projectId: string, _orderedIds: string[]): Promise<void> {
  throw fixed();
}
