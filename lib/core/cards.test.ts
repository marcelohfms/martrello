// lib/core/cards.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { makeTestDb, type Db } from './test-helpers';
import { createProject, getProjectByNameOrId } from './projects';
import { createLabel } from './labels';
import { createCard, updateCard, moveCard, archiveCard, unarchiveCard, getCardById, searchCards } from './cards';

let db: Db;
let close: () => void;
beforeEach(() => { const t = makeTestDb(); db = t.db; close = t.close; });

async function setup() {
  const p = await createProject(db, { name: 'p' });
  const full = await getProjectByNameOrId(db, p.id);
  return { p, lists: full.lists };
}

describe('cards', () => {
  it('creates a card in the first list by default', async () => {
    const { p, lists } = await setup();
    const c = await createCard(db, { project: p.id, title: 'hello' });
    expect(c.listId).toBe(lists[0].id);
    expect(c.title).toBe('hello');
    close();
  });

  it('creates with description and due_date (parsed)', async () => {
    const { p } = await setup();
    const c = await createCard(db, { project: p.id, title: 't', description: '# md', dueDate: '2026-06-15' });
    expect(c.description).toBe('# md');
    expect(c.dueDate).toBe('2026-06-15');
    close();
  });

  it('rejects unknown labels', async () => {
    const { p } = await setup();
    await expect(createCard(db, { project: p.id, title: 't', labels: ['nope'] })).rejects.toThrow(/LABEL_NOT_FOUND/);
    close();
  });

  it('attaches existing labels', async () => {
    const { p } = await setup();
    await createLabel(db, 'bug', '#f97316');
    const c = await createCard(db, { project: p.id, title: 't', labels: ['bug'] });
    const fetched = await getCardById(db, c.id);
    expect(fetched.labels.map((l) => l.name)).toEqual(['bug']);
    close();
  });

  it('updates title, description, dueDate', async () => {
    const { p } = await setup();
    const c = await createCard(db, { project: p.id, title: 'old' });
    const u = await updateCard(db, c.id, { title: 'new', description: 'desc', dueDate: 'amanha' });
    expect(u.title).toBe('new');
    expect(u.dueDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    close();
  });

  it('moves card to another list in same project', async () => {
    const { p, lists } = await setup();
    const c = await createCard(db, { project: p.id, title: 't' });
    await moveCard(db, c.id, { toList: lists[1].id });
    const m = await getCardById(db, c.id);
    expect(m.listId).toBe(lists[1].id);
    close();
  });

  it('rejects moving to a list in a different project', async () => {
    const { p } = await setup();
    const other = await createProject(db, { name: 'other' });
    const otherFull = await getProjectByNameOrId(db, other.id);
    const c = await createCard(db, { project: p.id, title: 't' });
    await expect(moveCard(db, c.id, { toList: otherFull.lists[0].id })).rejects.toThrow(/LIST_NOT_IN_PROJECT/);
    close();
  });

  it('moves card across projects via toProject + toList', async () => {
    const { p } = await setup();
    const other = await createProject(db, { name: 'other' });
    const otherFull = await getProjectByNameOrId(db, other.id);
    const c = await createCard(db, { project: p.id, title: 't' });
    await moveCard(db, c.id, { toProject: other.id, toList: otherFull.lists[0].id });
    const m = await getCardById(db, c.id);
    expect(m.projectId).toBe(other.id);
    expect(m.listId).toBe(otherFull.lists[0].id);
    close();
  });

  it('archive removes sprint slot if present', async () => {
    const { p } = await setup();
    const c = await createCard(db, { project: p.id, title: 't' });
    // start a sprint and add card to it manually for now
    const { sprints, sprintSlots } = await import('@/lib/db/schema');
    const { ulid } = await import('ulidx');
    const sid = ulid();
    await db.insert(sprints).values({ id: sid, startedAt: Date.now() });
    await db.insert(sprintSlots).values({ cardId: c.id, sprintId: sid, sprintList: 'backlog', position: 1000, addedAt: Date.now() });

    await archiveCard(db, c.id);
    const { eq } = await import('drizzle-orm');
    const slots = await db.select().from(sprintSlots).where(eq(sprintSlots.cardId, c.id));
    expect(slots).toHaveLength(0);
    close();
  });

  it('unarchive does not restore sprint slot', async () => {
    const { p } = await setup();
    const c = await createCard(db, { project: p.id, title: 't' });
    await archiveCard(db, c.id);
    await unarchiveCard(db, c.id);
    const m = await getCardById(db, c.id);
    expect(m.archivedAt).toBeNull();
    close();
  });

  it('searches cards by title substring', async () => {
    const { p } = await setup();
    await createCard(db, { project: p.id, title: 'revisar PR #123' });
    await createCard(db, { project: p.id, title: 'criar landing' });
    const out = await searchCards(db, { query: 'revisar' });
    expect(out.map((c) => c.title)).toEqual(['revisar PR #123']);
    close();
  });
});
