// lib/core/labels.ts
import { and, eq, sql } from 'drizzle-orm';
import { ulid } from 'ulidx';
import { labels, cardLabels, type Label } from '@/lib/db/schema';
import { MartrelloError, suggestClosest } from '@/lib/errors';
import type { Actor } from '@/lib/access/actor';
import { assertAdmin, loadVisibleCard } from '@/lib/access/guard';
import { recordCardEvent } from './events';
import type { Db } from './test-helpers';

/** Labels are global: any user may create one. */
export async function createLabel(db: Db, _actor: Actor, name: string, color: string): Promise<Label> {
  const existing = await db.select().from(labels).where(eq(labels.name, name));
  if (existing.length > 0) throw new MartrelloError('NAME_CONFLICT', `Label '${name}' já existe`);
  const id = ulid();
  await db.insert(labels).values({ id, name, color });
  return { id, name, color };
}

export async function listLabels(db: Db): Promise<Array<Label & { cardCount: number }>> {
  const rows = await db
    .select({
      l: labels,
      c: sql<number>`(SELECT COUNT(*) FROM ${cardLabels} WHERE ${cardLabels.labelId} = ${labels.id})`,
    })
    .from(labels);
  return rows.map((r) => ({ ...r.l, cardCount: Number(r.c) }));
}

export async function getLabelByNameOrId(db: Db, nameOrId: string): Promise<Label> {
  const found =
    (await db.select().from(labels).where(eq(labels.id, nameOrId)))[0] ??
    (await db.select().from(labels).where(eq(labels.name, nameOrId)))[0];
  if (!found) {
    const all = await db.select({ name: labels.name }).from(labels);
    throw new MartrelloError('LABEL_NOT_FOUND', `Label '${nameOrId}' não existe`, suggestClosest(nameOrId, all.map((r) => r.name)));
  }
  return found;
}

export async function addLabelToCard(db: Db, actor: Actor, cardId: string, labelNameOrId: string): Promise<void> {
  await loadVisibleCard(db, actor, cardId);
  const label = await getLabelByNameOrId(db, labelNameOrId);
  db.transaction((tx) => {
    const res = tx.insert(cardLabels).values({ cardId, labelId: label.id }).onConflictDoNothing().run();
    if (res.changes > 0) recordCardEvent(tx, { cardId, actor, type: 'label_added', to: label.name });
  });
}

export async function removeLabelFromCard(db: Db, actor: Actor, cardId: string, labelNameOrId: string): Promise<void> {
  await loadVisibleCard(db, actor, cardId);
  const label = await getLabelByNameOrId(db, labelNameOrId);
  db.transaction((tx) => {
    const res = tx.delete(cardLabels).where(and(eq(cardLabels.cardId, cardId), eq(cardLabels.labelId, label.id))).run();
    if (res.changes > 0) recordCardEvent(tx, { cardId, actor, type: 'label_removed', from: label.name });
  });
}

/** Admin only. Every card that loses the label gets a `label_removed` event. */
export async function deleteLabel(db: Db, actor: Actor, nameOrId: string): Promise<void> {
  assertAdmin(actor);
  const label = await getLabelByNameOrId(db, nameOrId);
  const tagged = await db.select({ cardId: cardLabels.cardId }).from(cardLabels).where(eq(cardLabels.labelId, label.id));
  const now = Date.now();
  db.transaction((tx) => {
    for (const { cardId } of tagged) recordCardEvent(tx, { cardId, actor, type: 'label_removed', from: label.name, at: now });
    tx.delete(labels).where(eq(labels.id, label.id)).run();
  });
}
