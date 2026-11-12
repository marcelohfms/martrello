// lib/core/labels.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { makeTestDb, makeUser, addMemberRow, type Db } from './test-helpers';
import { listCardEvents } from './events';
import type { Actor } from '@/lib/access/actor';
import { createLabel, listLabels, getLabelByNameOrId, addLabelToCard, removeLabelFromCard, deleteLabel } from './labels';
import { createProject, getProjectByNameOrId } from './projects';
import { ulid } from 'ulidx';

let db: Db;
let close: () => void;
let admin: Actor;
beforeEach(async () => {
  const t = makeTestDb();
  db = t.db;
  close = t.close;
  admin = (await makeUser(db, { role: 'admin' })).actor;
});

async function makeCard() {
  const p = await createProject(db, admin, { name: 'p' });
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
    await createLabel(db, admin, 'urgente', '#ef4444');
    const all = await listLabels(db);
    expect(all).toHaveLength(1);
    expect(all[0].name).toBe('urgente');
    close();
  });

  it('errors on duplicate name', async () => {
    await createLabel(db, admin, 'urgente', '#ef4444');
    await expect(createLabel(db, admin, 'urgente', '#000')).rejects.toThrow(/NAME_CONFLICT/);
    close();
  });

  it('attaches a label to a card by name', async () => {
    await createLabel(db, admin, 'bug', '#f97316');
    const cardId = await makeCard();
    await addLabelToCard(db, admin, cardId, 'bug');
    const { cardLabels } = await import('@/lib/db/schema');
    const { eq } = await import('drizzle-orm');
    const rows = await db.select().from(cardLabels).where(eq(cardLabels.cardId, cardId));
    expect(rows).toHaveLength(1);
    close();
  });

  it('throws LABEL_NOT_FOUND with suggestions', async () => {
    await createLabel(db, admin, 'urgente', '#ef4444');
    const cardId = await makeCard();
    try {
      await addLabelToCard(db, admin, cardId, 'urgnt');
      expect.unreachable();
    } catch (e: any) {
      expect(e.code).toBe('LABEL_NOT_FOUND');
      expect(e.suggestions).toContain('urgente');
    }
    close();
  });

  it('removes label from card (idempotent)', async () => {
    await createLabel(db, admin, 'bug', '#f97316');
    const cardId = await makeCard();
    await addLabelToCard(db, admin, cardId, 'bug');
    await removeLabelFromCard(db, admin, cardId, 'bug');
    await removeLabelFromCard(db, admin, cardId, 'bug'); // no throw
    close();
  });

  it('deletes label cascade-removes from cards', async () => {
    const l = await createLabel(db, admin, 'bug', '#f97316');
    const cardId = await makeCard();
    await addLabelToCard(db, admin, cardId, 'bug');
    await deleteLabel(db, admin, l.id);
    const { cardLabels } = await import('@/lib/db/schema');
    const { eq } = await import('drizzle-orm');
    const rows = await db.select().from(cardLabels).where(eq(cardLabels.cardId, cardId));
    expect(rows).toHaveLength(0);
    close();
  });

  it('registra label_added e label_removed só quando muda', async () => {
    await createLabel(db, admin, 'bug', '#f97316');
    const cardId = await makeCard();
    await addLabelToCard(db, admin, cardId, 'bug');
    await addLabelToCard(db, admin, cardId, 'bug');
    await removeLabelFromCard(db, admin, cardId, 'bug');
    await removeLabelFromCard(db, admin, cardId, 'bug');
    const events = await listCardEvents(db, admin, cardId);
    expect(events.map((e) => [e.type, e.from, e.to])).toEqual([
      ['label_added', null, 'bug'],
      ['label_removed', 'bug', null],
    ]);
    close();
  });

  it('membro cria label e mexe em card do seu projeto, mas não exclui label', async () => {
    const cardId = await makeCard();
    const { cards } = await import('@/lib/db/schema');
    const { eq } = await import('drizzle-orm');
    const projectId = (await db.select().from(cards).where(eq(cards.id, cardId)))[0].projectId;
    const m = await makeUser(db);
    addMemberRow(db, projectId, m.user.id);
    await createLabel(db, m.actor, 'bug', '#f97316');
    await addLabelToCard(db, m.actor, cardId, 'bug');
    await expect(deleteLabel(db, m.actor, 'bug')).rejects.toMatchObject({ code: 'FORBIDDEN' });
    close();
  });

  it('membro não mexe em labels de card de projeto alheio', async () => {
    await createLabel(db, admin, 'bug', '#f97316');
    const cardId = await makeCard();
    const outsider = await makeUser(db);
    await expect(addLabelToCard(db, outsider.actor, cardId, 'bug')).rejects.toMatchObject({ code: 'CARD_NOT_FOUND' });
    await expect(removeLabelFromCard(db, outsider.actor, cardId, 'bug')).rejects.toMatchObject({ code: 'CARD_NOT_FOUND' });
    close();
  });
});
