import { describe, it, expect, beforeEach } from 'vitest';
import { makeTestDb, makeUser, type Db } from './test-helpers';
import { SYSTEM_ACTOR } from '@/lib/access/actor';
import { createProject, setProjectSlackChannel, listProjects, updateProject, archiveProject, reorderProjects, getProjectByNameOrId, PROJECT_COLOR_PALETTE } from './projects';
import { MartrelloError } from '@/lib/errors';

let db: Db;
let close: () => void;

beforeEach(() => {
  const t = makeTestDb();
  db = t.db;
  close = t.close;
});

describe('projects', () => {
  it('creates a project with the four fixed stage lists', async () => {
    const p = await createProject(db, SYSTEM_ACTOR, { name: 'foo' });
    expect(p.name).toBe('foo');
    const fetched = await getProjectByNameOrId(db, 'foo');
    expect(fetched.id).toBe(p.id);
    expect(fetched.lists.map((l) => [l.name, l.stage])).toEqual([
      ['Backlog', 'backlog'], ['A fazer', 'todo'], ['Fazendo', 'doing'], ['Feito', 'done'],
    ]);
    close();
  });

  it('errors on duplicate name', async () => {
    await createProject(db, SYSTEM_ACTOR, { name: 'foo' });
    await expect(createProject(db, SYSTEM_ACTOR, { name: 'foo' })).rejects.toThrow(/NAME_CONFLICT/);
    close();
  });

  it('lists projects in position order, excluding archived by default', async () => {
    const a = await createProject(db, SYSTEM_ACTOR, { name: 'a' });
    const b = await createProject(db, SYSTEM_ACTOR, { name: 'b' });
    await archiveProject(db, SYSTEM_ACTOR, b.id);
    const all = await listProjects(db, SYSTEM_ACTOR);
    expect(all.map((p) => p.id)).toEqual([a.id]);
    const withArchived = await listProjects(db, SYSTEM_ACTOR, { includeArchived: true });
    expect(withArchived).toHaveLength(2);
    close();
  });

  it('listProjects returns accurate listCount and cardCount', async () => {
    const p = await createProject(db, SYSTEM_ACTOR, { name: 'a' });
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
    const all = await listProjects(db, SYSTEM_ACTOR);
    expect(all[0].listCount).toBe(4);
    expect(all[0].cardCount).toBe(1);
    close();
  });

  it('updates name and color', async () => {
    const p = await createProject(db, SYSTEM_ACTOR, { name: 'foo' });
    const u = await updateProject(db, SYSTEM_ACTOR, p.id, { name: 'bar', color: '#123456' });
    expect(u.name).toBe('bar');
    expect(u.color).toBe('#123456');
    close();
  });

  it('reorders projects', async () => {
    const a = await createProject(db, SYSTEM_ACTOR, { name: 'a' });
    const b = await createProject(db, SYSTEM_ACTOR, { name: 'b' });
    const c = await createProject(db, SYSTEM_ACTOR, { name: 'c' });
    await reorderProjects(db, SYSTEM_ACTOR, [c.id, a.id, b.id]);
    const ordered = await listProjects(db, SYSTEM_ACTOR);
    expect(ordered.map((p) => p.name)).toEqual(['c', 'a', 'b']);
    close();
  });

  it('throws PROJECT_NOT_FOUND with suggestions', async () => {
    await createProject(db, SYSTEM_ACTOR, { name: 'martrello' });
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

  it('auto-suggests an acronym when none provided', async () => {
    const p = await createProject(db, SYSTEM_ACTOR, { name: 'Nubank' });
    expect(p.acronym).toBe('NBK');
    close();
  });

  it('accepts an explicit acronym, normalized to uppercase', async () => {
    const p = await createProject(db, SYSTEM_ACTOR, { name: 'foo', acronym: 'xyz' });
    expect(p.acronym).toBe('XYZ');
    close();
  });

  it('rejects a duplicate acronym on create, regardless of case', async () => {
    await createProject(db, SYSTEM_ACTOR, { name: 'foo', acronym: 'ABC' });
    await expect(createProject(db, SYSTEM_ACTOR, { name: 'bar', acronym: 'abc' })).rejects.toThrow(/NAME_CONFLICT/);
    close();
  });

  it('rejects two different names whose auto-suggested acronyms happen to collide', async () => {
    await createProject(db, SYSTEM_ACTOR, { name: 'Lemon' });
    await expect(createProject(db, SYSTEM_ACTOR, { name: 'Lumon' })).rejects.toThrow(/NAME_CONFLICT/);
    close();
  });

  it('cycles through the green palette by creation order when color is omitted', async () => {
    const a = await createProject(db, SYSTEM_ACTOR, { name: 'a' });
    const b = await createProject(db, SYSTEM_ACTOR, { name: 'b' });
    expect(a.color).toBe(PROJECT_COLOR_PALETTE[0]);
    expect(b.color).toBe(PROJECT_COLOR_PALETTE[1]);
    close();
  });

  it('updateProject can change the acronym, rejecting duplicates case-insensitively', async () => {
    const a = await createProject(db, SYSTEM_ACTOR, { name: 'a', acronym: 'AAA' });
    const b = await createProject(db, SYSTEM_ACTOR, { name: 'b', acronym: 'BBB' });
    const updated = await updateProject(db, SYSTEM_ACTOR, a.id, { acronym: 'ccc' });
    expect(updated.acronym).toBe('CCC');
    await expect(updateProject(db, SYSTEM_ACTOR, b.id, { acronym: 'CCC' })).rejects.toThrow(/NAME_CONFLICT/);
    close();
  });

  it('createProject auto-suggests an acronym when an explicit empty string is passed', async () => {
    const p = await createProject(db, SYSTEM_ACTOR, { name: 'Nubank', acronym: '' });
    expect(p.acronym).toBe('NBK');
    close();
  });

  it('updateProject treats an empty-string acronym patch as no change, without corrupting the row', async () => {
    const a = await createProject(db, SYSTEM_ACTOR, { name: 'a', acronym: 'AAA' });
    const updated = await updateProject(db, SYSTEM_ACTOR, a.id, { acronym: '' });
    expect(updated.acronym).toBe('AAA');
    close();
  });

  it('setProjectSlackChannel grava e limpa; membro recebe FORBIDDEN', async () => {
    const p = await createProject(db, SYSTEM_ACTOR, { name: 'slack' });
    await setProjectSlackChannel(db, SYSTEM_ACTOR, p.id, { id: 'C1', name: 'geral' });
    let got = await getProjectByNameOrId(db, p.id);
    expect([got.slackChannelId, got.slackChannelName]).toEqual(['C1', 'geral']);
    await setProjectSlackChannel(db, SYSTEM_ACTOR, p.id, null);
    got = await getProjectByNameOrId(db, p.id);
    expect([got.slackChannelId, got.slackChannelName]).toEqual([null, null]);
    const m = await makeUser(db);
    await expect(setProjectSlackChannel(db, m.actor, p.id, { id: 'C1', name: 'geral' })).rejects.toThrow(/FORBIDDEN/);
    await expect(setProjectSlackChannel(db, SYSTEM_ACTOR, 'nope', null)).rejects.toThrow(/PROJECT_NOT_FOUND/);
    close();
  });
});
