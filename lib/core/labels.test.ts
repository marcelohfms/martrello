// lib/core/labels.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { makeTestDb, type Db } from './test-helpers';
import { createLabel, listLabels, getLabelByNameOrId, addLabelToCard, removeLabelFromCard, deleteLabel } from './labels';
import { createProject, getProjectByNameOrId } from './projects';
import { ulid } from 'ulidx';

let db: Db;
let close: () => void;
beforeEach(() => { const t = makeTestDb(); db = t.db; close = t.close; });

async function makeCard() {
  const p = await createProject(db, { name: 'p' });
  const full = await getProjectByNameOrId(db, p.id);
  const list = full.lists[0];
  const { cards } = await import('@/lib/db/schema');
  const id = ulid();
  await db.insert(cards).values({
    id, projectId: p.id, listId: list.id, title: 't', position: 1000,
    createdAt: Date.now(), updatedAt: Date.now(),
  });
  return id;
}

describe('labels', () => {
  it('creates and lists labels', async () => {
    await createLabel(db, 'urgente', '#ef4444');
    const all = await listLabels(db);
    expect(all).toHaveLength(1);
    expect(all[0].name).toBe('urgente');
    close();
  });

  it('errors on duplicate name', async () => {
    await createLabel(db, 'urgente', '#ef4444');
    await expect(createLabel(db, 'urgente', '#000')).rejects.toThrow(/NAME_CONFLICT/);
    close();
  });

  it('attaches a label to a card by name', async () => {
    await createLabel(db, 'bug', '#f97316');
    const cardId = await makeCard();
    await addLabelToCard(db, cardId, 'bug');
    const { cardLabels } = await import('@/lib/db/schema');
    const { eq } = await import('drizzle-orm');
    const rows = await db.select().from(cardLabels).where(eq(cardLabels.cardId, cardId));
    expect(rows).toHaveLength(1);
    close();
  });

  it('throws LABEL_NOT_FOUND with suggestions', async () => {
    await createLabel(db, 'urgente', '#ef4444');
    const cardId = await makeCard();
    try {
      await addLabelToCard(db, cardId, 'urgnt');
      expect.unreachable();
    } catch (e: any) {
      expect(e.code).toBe('LABEL_NOT_FOUND');
      expect(e.suggestions).toContain('urgente');
    }
    close();
  });

  it('removes label from card (idempotent)', async () => {
    await createLabel(db, 'bug', '#f97316');
    const cardId = await makeCard();
    await addLabelToCard(db, cardId, 'bug');
    await removeLabelFromCard(db, cardId, 'bug');
    await removeLabelFromCard(db, cardId, 'bug'); // no throw
    close();
  });

  it('deletes label cascade-removes from cards', async () => {
    const l = await createLabel(db, 'bug', '#f97316');
    const cardId = await makeCard();
    await addLabelToCard(db, cardId, 'bug');
    await deleteLabel(db, l.id);
    const { cardLabels } = await import('@/lib/db/schema');
    const { eq } = await import('drizzle-orm');
    const rows = await db.select().from(cardLabels).where(eq(cardLabels.cardId, cardId));
    expect(rows).toHaveLength(0);
    close();
  });
});
