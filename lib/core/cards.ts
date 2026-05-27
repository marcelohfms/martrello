// lib/core/cards.ts
import { and, asc, desc, eq, like, max, isNull, sql } from 'drizzle-orm';
import { ulid } from 'ulidx';
import { cards, lists, cardLabels, labels, sprintSlots, type Card, type Label } from '@/lib/db/schema';
import { MartrelloError } from '@/lib/errors';
import { POSITION_STEP } from './positions';
import { parseDate } from './dates';
import { getProjectByNameOrId } from './projects';
import { getListByNameOrId } from './lists';
import { addLabelToCard } from './labels';
import type { Db } from './test-helpers';

function maybeParseDate(input?: string | null): string | undefined {
  if (input == null || input === '') return undefined;
  return parseDate(input);
}

export async function createCard(
  db: Db,
  input: {
    project: string;
    list?: string;
    title: string;
    description?: string;
    dueDate?: string;
    labels?: string[];
    addToSprint?: boolean;
  },
): Promise<Card> {
  const project = await getProjectByNameOrId(db, input.project);
  const listEntity = input.list
    ? await getListByNameOrId(db, project.id, input.list)
    : project.lists[0];
  if (!listEntity) throw new MartrelloError('LIST_NOT_FOUND', `Projeto '${project.name}' não tem listas`);

  const maxPos = (await db.select({ m: max(cards.position) }).from(cards).where(eq(cards.listId, listEntity.id)))[0]?.m ?? 0;
  const id = ulid();
  const now = Date.now();
  const due = maybeParseDate(input.dueDate);

  await db.insert(cards).values({
    id,
    projectId: project.id,
    listId: listEntity.id,
    title: input.title,
    description: input.description ?? null,
    dueDate: due ?? null,
    position: maxPos + POSITION_STEP,
    createdAt: now,
    updatedAt: now,
  });

  if (input.labels?.length) {
    for (const lab of input.labels) await addLabelToCard(db, id, lab);
  }

  if (input.addToSprint) {
    const { addToSprint } = await import('./sprint');
    await addToSprint(db, id, 'backlog');
  }

  return (await db.select().from(cards).where(eq(cards.id, id)))[0];
}

export async function getCardById(db: Db, id: string): Promise<Card & { labels: Label[] }> {
  const card = (await db.select().from(cards).where(eq(cards.id, id)))[0];
  if (!card) throw new MartrelloError('CARD_NOT_FOUND', `Card ${id} não existe`);
  const labelRows = await db
    .select({ l: labels })
    .from(cardLabels)
    .innerJoin(labels, eq(cardLabels.labelId, labels.id))
    .where(eq(cardLabels.cardId, id));
  return { ...card, labels: labelRows.map((r) => r.l) };
}

export async function updateCard(
  db: Db,
  id: string,
  patch: { title?: string; description?: string | null; dueDate?: string | null },
): Promise<Card> {
  const card = (await db.select().from(cards).where(eq(cards.id, id)))[0];
  if (!card) throw new MartrelloError('CARD_NOT_FOUND', `Card ${id} não existe`);
  const update: Partial<Card> = { updatedAt: Date.now() };
  if (patch.title !== undefined) update.title = patch.title;
  if (patch.description !== undefined) update.description = patch.description ?? null;
  if (patch.dueDate !== undefined) update.dueDate = patch.dueDate ? parseDate(patch.dueDate) : null;
  await db.update(cards).set(update).where(eq(cards.id, id));
  return (await db.select().from(cards).where(eq(cards.id, id)))[0];
}

export async function moveCard(
  db: Db,
  id: string,
  target: { toProject?: string; toList: string; position?: number },
): Promise<void> {
  const card = (await db.select().from(cards).where(eq(cards.id, id)))[0];
  if (!card) throw new MartrelloError('CARD_NOT_FOUND', `Card ${id} não existe`);

  const targetProjectId = target.toProject ? (await getProjectByNameOrId(db, target.toProject)).id : card.projectId;

  // Look up the list by ID or name — but first try by raw ID globally, then validate project membership
  const targetList = (await db.select().from(lists).where(eq(lists.id, target.toList)))[0]
    ?? (await db.select().from(lists).where(and(eq(lists.name, target.toList), eq(lists.projectId, targetProjectId))))[0];

  if (!targetList) {
    throw new MartrelloError('LIST_NOT_FOUND', `Lista '${target.toList}' não existe`);
  }

  if (targetList.projectId !== targetProjectId) {
    throw new MartrelloError('LIST_NOT_IN_PROJECT', `Lista '${target.toList}' não pertence ao projeto destino`);
  }

  const maxPos = (await db.select({ m: max(cards.position) }).from(cards).where(eq(cards.listId, targetList.id)))[0]?.m ?? 0;
  const newPos = target.position ?? maxPos + POSITION_STEP;

  await db.update(cards).set({
    projectId: targetProjectId,
    listId: targetList.id,
    position: newPos,
    updatedAt: Date.now(),
  }).where(eq(cards.id, id));
}

export async function archiveCard(db: Db, id: string): Promise<void> {
  const card = (await db.select().from(cards).where(eq(cards.id, id)))[0];
  if (!card) throw new MartrelloError('CARD_NOT_FOUND', `Card ${id} não existe`);
  await db.transaction((tx) => {
    tx.update(cards).set({ archivedAt: Date.now(), updatedAt: Date.now() }).where(eq(cards.id, id)).run();
    tx.delete(sprintSlots).where(eq(sprintSlots.cardId, id)).run();
  });
}

export async function unarchiveCard(db: Db, id: string): Promise<void> {
  const card = (await db.select().from(cards).where(eq(cards.id, id)))[0];
  if (!card) throw new MartrelloError('CARD_NOT_FOUND', `Card ${id} não existe`);
  await db.update(cards).set({ archivedAt: null, updatedAt: Date.now() }).where(eq(cards.id, id));
}

export async function searchCards(
  db: Db,
  opts: { query: string; project?: string; label?: string; includeArchived?: boolean },
): Promise<Card[]> {
  const pattern = `%${opts.query.toLowerCase()}%`;
  const where = [
    sql`LOWER(${cards.title}) LIKE ${pattern}`,
  ];
  if (!opts.includeArchived) where.push(isNull(cards.archivedAt));
  if (opts.project) {
    const p = await getProjectByNameOrId(db, opts.project);
    where.push(eq(cards.projectId, p.id));
  }
  const rows = await db.select().from(cards).where(and(...where)).orderBy(desc(cards.updatedAt));
  return rows;
}
