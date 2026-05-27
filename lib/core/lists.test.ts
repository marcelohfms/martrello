// lib/core/lists.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { makeTestDb, type Db } from './test-helpers';
import { createProject } from './projects';
import { createList, renameList, deleteList, reorderLists, getListByNameOrId } from './lists';

let db: Db;
let close: () => void;
beforeEach(() => { const t = makeTestDb(); db = t.db; close = t.close; });

describe('lists', () => {
  it('creates a list at the end of a project', async () => {
    const p = await createProject(db, { name: 'p' });
    const l = await createList(db, p.id, 'Em revisão');
    expect(l.projectId).toBe(p.id);
    const fetched = await getListByNameOrId(db, p.id, 'Em revisão');
    expect(fetched.id).toBe(l.id);
    close();
  });

  it('renames a list', async () => {
    const p = await createProject(db, { name: 'p' });
    const fazendo = await getListByNameOrId(db, p.id, 'Fazendo');
    const renamed = await renameList(db, fazendo.id, 'Doing');
    expect(renamed.name).toBe('Doing');
    close();
  });

  it('refuses to delete a non-empty list without force', async () => {
    const p = await createProject(db, { name: 'p' });
    const l = await getListByNameOrId(db, p.id, 'A fazer');
    // simulate a card present
    const { cards } = await import('@/lib/db/schema');
    await db.insert(cards).values({
      id: 'c1', projectId: p.id, listId: l.id, title: 't', position: 1000,
      createdAt: Date.now(), updatedAt: Date.now(),
    });
    await expect(deleteList(db, l.id, { force: false })).rejects.toThrow(/LIST_NOT_EMPTY/);
    close();
  });

  it('deletes with force, cascading cards', async () => {
    const p = await createProject(db, { name: 'p' });
    const l = await getListByNameOrId(db, p.id, 'A fazer');
    const { cards } = await import('@/lib/db/schema');
    await db.insert(cards).values({
      id: 'c1', projectId: p.id, listId: l.id, title: 't', position: 1000,
      createdAt: Date.now(), updatedAt: Date.now(),
    });
    await deleteList(db, l.id, { force: true });
    const { eq } = await import('drizzle-orm');
    const remaining = await db.select().from(cards).where(eq(cards.id, 'c1'));
    expect(remaining).toHaveLength(0);
    close();
  });

  it('reorders lists', async () => {
    const p = await createProject(db, { name: 'p' });
    const a = await getListByNameOrId(db, p.id, 'A fazer');
    const f = await getListByNameOrId(db, p.id, 'Fazendo');
    const d = await getListByNameOrId(db, p.id, 'Feito');
    await reorderLists(db, p.id, [d.id, a.id, f.id]);
    const { lists } = await import('@/lib/db/schema');
    const { asc, eq } = await import('drizzle-orm');
    const ordered = await db.select().from(lists).where(eq(lists.projectId, p.id)).orderBy(asc(lists.position));
    expect(ordered.map((l) => l.id)).toEqual([d.id, a.id, f.id]);
    close();
  });
});
