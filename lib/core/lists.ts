// lib/core/lists.ts
import type { List } from '@/lib/db/schema';
import { MartrelloError } from '@/lib/errors';
import type { Db } from './test-helpers';

const fixed = () => new MartrelloError('LISTS_ARE_FIXED', 'As listas são fixas: Backlog, A fazer, Fazendo e Feito');

export async function createList(_db: Db, _projectId: string, _name: string, _position?: number): Promise<List> {
  throw fixed();
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
