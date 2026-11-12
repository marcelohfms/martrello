// lib/core/lists.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { makeTestDb, type Db } from './test-helpers';
import { SYSTEM_ACTOR } from '@/lib/access/actor';
import { createProject } from './projects';
import { createList, renameList, deleteList, reorderLists } from './lists';
import { getStageList, resolveListRef } from './stages';

let db: Db;
let close: () => void;
beforeEach(() => { const t = makeTestDb(); db = t.db; close = t.close; });

describe('lists', () => {
  it('lists are fixed: create/rename/delete/reorder throw LISTS_ARE_FIXED', async () => {
    const p = await createProject(db, SYSTEM_ACTOR, { name: 'p' });
    const l = await getStageList(db, p.id, 'todo');
    await expect(createList(db, p.id, 'Em revisão')).rejects.toThrow(/LISTS_ARE_FIXED/);
    await expect(renameList(db, l.id, 'X')).rejects.toThrow(/LISTS_ARE_FIXED/);
    await expect(deleteList(db, l.id)).rejects.toThrow(/LISTS_ARE_FIXED/);
    await expect(reorderLists(db, p.id, [l.id])).rejects.toThrow(/LISTS_ARE_FIXED/);
    close();
  });
});

describe('stages', () => {
  it('getStageList and resolveListRef accept id, list name and stage', async () => {
    const p = await createProject(db, SYSTEM_ACTOR, { name: 'p' });
    const doing = await getStageList(db, p.id, 'doing');
    expect(doing.name).toBe('Fazendo');
    expect((await resolveListRef(db, p.id, doing.id)).id).toBe(doing.id);
    expect((await resolveListRef(db, p.id, 'Fazendo')).id).toBe(doing.id);
    expect((await resolveListRef(db, p.id, 'doing')).id).toBe(doing.id);
    await expect(resolveListRef(db, p.id, 'nada')).rejects.toThrow(/LIST_NOT_FOUND/);
    close();
  });
});
