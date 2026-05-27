// lib/core/sprint.ts
import { and, asc, count, desc, eq, isNull, max } from 'drizzle-orm';
import { ulid } from 'ulidx';
import { sprints, sprintSlots, cards, projects, labels, cardLabels, type Sprint, type SprintList } from '@/lib/db/schema';
import { MartrelloError } from '@/lib/errors';
import { POSITION_STEP } from './positions';
import type { Db } from './test-helpers';

export type SprintCard = {
  id: string;
  title: string;
  projectId: string;
  projectName: string;
  projectColor: string;
  sprintList: SprintList;
  position: number;
  dueDate: string | null;
  labels: Array<{ name: string; color: string }>;
};

export async function getActiveSprintRow(db: Db): Promise<Sprint | null> {
  return (await db.select().from(sprints).where(isNull(sprints.closedAt)))[0] ?? null;
}

async function loadSprintCards(db: Db, sprintId: string): Promise<SprintCard[]> {
  const rows = await db
    .select({
      slot: sprintSlots,
      card: cards,
      project: projects,
    })
    .from(sprintSlots)
    .innerJoin(cards, eq(sprintSlots.cardId, cards.id))
    .innerJoin(projects, eq(cards.projectId, projects.id))
    .where(eq(sprintSlots.sprintId, sprintId))
    .orderBy(asc(sprintSlots.position));

  const out: SprintCard[] = [];
  for (const r of rows) {
    const lrows = await db
      .select({ l: labels })
      .from(cardLabels)
      .innerJoin(labels, eq(cardLabels.labelId, labels.id))
      .where(eq(cardLabels.cardId, r.card.id));
    out.push({
      id: r.card.id,
      title: r.card.title,
      projectId: r.project.id,
      projectName: r.project.name,
      projectColor: r.project.color,
      sprintList: r.slot.sprintList,
      position: r.slot.position,
      dueDate: r.card.dueDate,
      labels: lrows.map((x) => ({ name: x.l.name, color: x.l.color })),
    });
  }
  return out;
}

export async function getActiveSprint(db: Db): Promise<(Sprint & { cards: SprintCard[] }) | null> {
  const s = await getActiveSprintRow(db);
  if (!s) return null;
  const c = await loadSprintCards(db, s.id);
  return { ...s, cards: c };
}

export async function startSprint(db: Db, name?: string): Promise<Sprint> {
  const active = await getActiveSprintRow(db);
  if (active) throw new MartrelloError('SPRINT_ALREADY_ACTIVE', `Sprint '${active.name ?? active.id}' já está ativa`);
  const total = (await db.select({ c: count() }).from(sprints))[0]?.c ?? 0;
  const id = ulid();
  const finalName = name?.trim() || `Sprint ${Number(total) + 1}`;
  await db.insert(sprints).values({ id, name: finalName, startedAt: Date.now() });
  return (await db.select().from(sprints).where(eq(sprints.id, id)))[0];
}

async function requireActiveSprint(db: Db): Promise<Sprint> {
  const s = await getActiveSprintRow(db);
  if (!s) throw new MartrelloError('NO_ACTIVE_SPRINT', 'Nenhuma sprint ativa. Inicie com martrello_start_sprint.');
  return s;
}

export async function addToSprint(db: Db, cardId: string, sprintList: SprintList = 'backlog') {
  const sprint = await requireActiveSprint(db);
  const card = (await db.select().from(cards).where(eq(cards.id, cardId)))[0];
  if (!card) throw new MartrelloError('CARD_NOT_FOUND', `Card ${cardId} não existe`);
  if (card.archivedAt) throw new MartrelloError('CARD_NOT_FOUND', `Card '${card.title}' está arquivado`);

  const existing = (await db.select().from(sprintSlots).where(eq(sprintSlots.cardId, cardId)))[0];
  const maxPos = (await db
    .select({ m: max(sprintSlots.position) })
    .from(sprintSlots)
    .where(and(eq(sprintSlots.sprintId, sprint.id), eq(sprintSlots.sprintList, sprintList))))[0]?.m ?? 0;
  const newPos = maxPos + POSITION_STEP;

  if (existing) {
    await db.update(sprintSlots).set({ sprintList, position: newPos }).where(eq(sprintSlots.cardId, cardId));
  } else {
    await db.insert(sprintSlots).values({
      cardId, sprintId: sprint.id, sprintList, position: newPos, addedAt: Date.now(),
    });
  }
  return (await db.select().from(sprintSlots).where(eq(sprintSlots.cardId, cardId)))[0];
}

export async function moveInSprint(db: Db, cardId: string, sprintList: SprintList, position?: number) {
  const sprint = await requireActiveSprint(db);
  const slot = (await db.select().from(sprintSlots).where(eq(sprintSlots.cardId, cardId)))[0];
  if (!slot) throw new MartrelloError('CARD_NOT_FOUND', `Card ${cardId} não está na sprint ativa`);
  const maxPos = (await db
    .select({ m: max(sprintSlots.position) })
    .from(sprintSlots)
    .where(and(eq(sprintSlots.sprintId, sprint.id), eq(sprintSlots.sprintList, sprintList))))[0]?.m ?? 0;
  await db.update(sprintSlots).set({
    sprintList,
    position: position ?? maxPos + POSITION_STEP,
  }).where(eq(sprintSlots.cardId, cardId));
}

export async function removeFromSprint(db: Db, cardId: string) {
  await db.delete(sprintSlots).where(eq(sprintSlots.cardId, cardId));
}

export async function listSprints(db: Db, opts: { limit?: number } = {}) {
  const rows = await db.select().from(sprints).orderBy(desc(sprints.startedAt), desc(sprints.id)).limit(opts.limit ?? 20);
  return rows;
}

export async function getSprintHistory(db: Db, sprintId: string) {
  const row = (await db.select().from(sprints).where(eq(sprints.id, sprintId)))[0];
  if (!row) throw new MartrelloError('SPRINT_NOT_FOUND', `Sprint ${sprintId} não existe`);
  const snapshot = row.cardsSnapshot ? JSON.parse(row.cardsSnapshot) : [];
  return { ...row, cards: snapshot as SprintCard[] };
}

export async function closeSprint(
  db: Db,
  opts: { nameForNext?: string; carryIncomplete?: boolean } = {},
): Promise<{
  closed: { id: string; name: string | null; doneCount: number; carriedCount: number };
  opened?: { id: string; name: string | null };
}> {
  const carry = opts.carryIncomplete ?? true;
  const active = await requireActiveSprint(db);
  const snapshot = await loadSprintCards(db, active.id);

  const doneCardIds = snapshot.filter((s) => s.sprintList === 'done').map((s) => s.id);
  const incomplete = snapshot.filter((s) => s.sprintList !== 'done');
  const carriedCount = carry ? incomplete.length : 0;
  const now = Date.now();

  let newSprintId: string | null = null;
  let newSprintName: string | null = null;

  if (carry && incomplete.length > 0) {
    const total = (await db.select({ c: count() }).from(sprints))[0]?.c ?? 0;
    newSprintId = ulid();
    newSprintName = opts.nameForNext?.trim() || `Sprint ${Number(total) + 1}`;
  }

  db.transaction((tx) => {
    tx.update(sprints).set({
      closedAt: now,
      cardsSnapshot: JSON.stringify(snapshot),
    }).where(eq(sprints.id, active.id)).run();

    // archive done cards (cascade deletes their slots)
    for (const cid of doneCardIds) {
      tx.update(cards).set({ archivedAt: now, updatedAt: now }).where(eq(cards.id, cid)).run();
    }

    if (newSprintId) {
      tx.insert(sprints).values({ id: newSprintId, name: newSprintName, startedAt: now }).run();
      // re-point and re-position slots into the new sprint, preserving column
      const byCol = { backlog: 0, doing: 0, done: 0 } as Record<SprintList, number>;
      for (const card of incomplete) {
        byCol[card.sprintList] += 1;
        tx.update(sprintSlots).set({
          sprintId: newSprintId,
          position: byCol[card.sprintList] * POSITION_STEP,
        }).where(eq(sprintSlots.cardId, card.id)).run();
      }
    } else {
      // no carry: drop slots of non-done cards (done slots cascade-deleted by archive)
      for (const card of incomplete) {
        tx.delete(sprintSlots).where(eq(sprintSlots.cardId, card.id)).run();
      }
    }
  });

  const result: {
    closed: { id: string; name: string | null; doneCount: number; carriedCount: number };
    opened?: { id: string; name: string | null };
  } = {
    closed: { id: active.id, name: active.name, doneCount: doneCardIds.length, carriedCount },
  };
  if (newSprintId) result.opened = { id: newSprintId, name: newSprintName };
  return result;
}
