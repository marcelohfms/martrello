import { describe, it, expect, beforeEach } from 'vitest';
import { makeTestDb, type Db } from './test-helpers';
import { createProject, listProjects, updateProject, archiveProject, reorderProjects, getProjectByNameOrId } from './projects';
import { MartrelloError } from '@/lib/errors';

let db: Db;
let close: () => void;

beforeEach(() => {
  const t = makeTestDb();
  db = t.db;
  close = t.close;
});

describe('projects', () => {
  it('creates a project with default lists', async () => {
    const p = await createProject(db, { name: 'foo' });
    expect(p.name).toBe('foo');
    const fetched = await getProjectByNameOrId(db, 'foo');
    expect(fetched.id).toBe(p.id);
    expect(fetched.lists.map((l) => l.name)).toEqual(['A fazer', 'Fazendo', 'Feito']);
    close();
  });

  it('errors on duplicate name', async () => {
    await createProject(db, { name: 'foo' });
    await expect(createProject(db, { name: 'foo' })).rejects.toThrow(/NAME_CONFLICT/);
    close();
  });

  it('lists projects in position order, excluding archived by default', async () => {
    const a = await createProject(db, { name: 'a' });
    const b = await createProject(db, { name: 'b' });
    await archiveProject(db, b.id);
    const all = await listProjects(db);
    expect(all.map((p) => p.id)).toEqual([a.id]);
    const withArchived = await listProjects(db, { includeArchived: true });
    expect(withArchived).toHaveLength(2);
    close();
  });

  it('listProjects returns accurate listCount and cardCount', async () => {
    const p = await createProject(db, { name: 'a' });
    const { cards } = await import('@/lib/db/schema');
    const full = await getProjectByNameOrId(db, p.id);
    await db.insert(cards).values({
      id: 'c1', projectId: p.id, listId: full.lists[0].id, title: 'x',
      position: 1000, createdAt: Date.now(), updatedAt: Date.now(),
    });
    await db.insert(cards).values({
      id: 'c2', projectId: p.id, listId: full.lists[0].id, title: 'y',
      position: 2000, createdAt: Date.now(), updatedAt: Date.now(),
      archivedAt: Date.now(),
    });
    const all = await listProjects(db);
    expect(all[0].listCount).toBe(3);
    expect(all[0].cardCount).toBe(1);
    close();
  });

  it('updates name and color', async () => {
    const p = await createProject(db, { name: 'foo' });
    const u = await updateProject(db, p.id, { name: 'bar', color: '#123456' });
    expect(u.name).toBe('bar');
    expect(u.color).toBe('#123456');
    close();
  });

  it('reorders projects', async () => {
    const a = await createProject(db, { name: 'a' });
    const b = await createProject(db, { name: 'b' });
    const c = await createProject(db, { name: 'c' });
    await reorderProjects(db, [c.id, a.id, b.id]);
    const ordered = await listProjects(db);
    expect(ordered.map((p) => p.name)).toEqual(['c', 'a', 'b']);
    close();
  });

  it('throws PROJECT_NOT_FOUND with suggestions', async () => {
    await createProject(db, { name: 'martrello' });
    try {
      await getProjectByNameOrId(db, 'martelo');
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(MartrelloError);
      expect((e as MartrelloError).code).toBe('PROJECT_NOT_FOUND');
      expect((e as MartrelloError).suggestions).toContain('martrello');
    }
    close();
  });
});
