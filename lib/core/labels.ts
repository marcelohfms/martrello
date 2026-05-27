// lib/core/labels.ts
import { and, eq, sql } from 'drizzle-orm';
import { ulid } from 'ulidx';
import { labels, cardLabels, type Label } from '@/lib/db/schema';
import { MartrelloError, suggestClosest } from '@/lib/errors';
import type { Db } from './test-helpers';

export async function createLabel(db: Db, name: string, color: string): Promise<Label> {
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

export async function addLabelToCard(db: Db, cardId: string, labelNameOrId: string): Promise<void> {
  const label = await getLabelByNameOrId(db, labelNameOrId);
  await db.insert(cardLabels).values({ cardId, labelId: label.id }).onConflictDoNothing();
}

export async function removeLabelFromCard(db: Db, cardId: string, labelNameOrId: string): Promise<void> {
  const label = await getLabelByNameOrId(db, labelNameOrId);
  await db.delete(cardLabels).where(and(eq(cardLabels.cardId, cardId), eq(cardLabels.labelId, label.id)));
}

export async function deleteLabel(db: Db, nameOrId: string): Promise<void> {
  const label = await getLabelByNameOrId(db, nameOrId);
  await db.delete(labels).where(eq(labels.id, label.id));
}
