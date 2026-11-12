// lib/core/cards.ts
import { and, desc, eq, max, isNull, sql } from 'drizzle-orm';
import { ulid } from 'ulidx';
import { cards, lists, cardLabels, labels, sprintSlots, users, type Card, type Label, type List, type Stage } from '@/lib/db/schema';
import { MartrelloError } from '@/lib/errors';
import type { Actor } from '@/lib/access/actor';
import { assertProjectVisible, loadVisibleCard } from '@/lib/access/guard';
import { POSITION_STEP } from './positions';
import { parseDate } from './dates';
import { getProjectByNameOrId } from './projects';
import { getLabelByNameOrId } from './labels';
import { getBlockedStatuses, type DependencyInfo } from './dependencies';
import { STAGES, getStageList, resolveListRef } from './stages';
import { ASSIGNEE_REQUIRED_MESSAGE, actorAsAssignee, resolveAssignee, userEmail } from './assignee';
import { recordCardEvent } from './events';
import type { Db } from './test-helpers';

export type CardAssignee = { id: string; name: string; email: string };
export type CardDetails = Card & {
  labels: Label[];
  isBlocked: boolean;
  dependsOn: DependencyInfo[];
  assignee: CardAssignee | null;
};

function maybeParseDate(input?: string | null): string | undefined {
  if (input == null || input === '') return undefined;
  return parseDate(input);
}

function stageName(stage: Stage): string {
  return STAGES.find((s) => s.stage === stage)!.name;
}

async function nextPosition(db: Db, listId: string): Promise<number> {
  const maxPos = (await db.select({ m: max(cards.position) }).from(cards).where(eq(cards.listId, listId)))[0]?.m ?? 0;
  return maxPos + POSITION_STEP;
}

async function loadList(db: Db, listId: string): Promise<List> {
  return (await db.select().from(lists).where(eq(lists.id, listId)))[0];
}

/** A list id from another project is a caller error; otherwise accepts id, list name or stage. */
async function resolveTargetList(db: Db, projectId: string, ref: string): Promise<List> {
  const byId = await loadList(db, ref);
  if (byId && byId.projectId !== projectId) {
    throw new MartrelloError('LIST_NOT_IN_PROJECT', `Lista '${ref}' não pertence ao projeto destino`);
  }
  return byId ?? resolveListRef(db, projectId, ref);
}

async function reloadCard(db: Db, id: string): Promise<Card> {
  return (await db.select().from(cards).where(eq(cards.id, id)))[0];
}

export async function createCard(
  db: Db,
  actor: Actor,
  input: {
    project: string;
    list?: string;
    title: string;
    description?: string;
    dueDate?: string;
    labels?: string[];
    assignee?: string;
  },
): Promise<Card> {
  const project = await getProjectByNameOrId(db, input.project);
  await assertProjectVisible(db, actor, project.id);
  const list = input.list
    ? await resolveListRef(db, project.id, input.list)
    : await getStageList(db, project.id, 'backlog');

  let assigneeId: string | null = null;
  let assigneeEmail: string | null = null;
  if (input.assignee) {
    const u = await resolveAssignee(db, project.id, input.assignee);
    assigneeId = u.id;
    assigneeEmail = u.email;
  } else if (list.stage !== 'backlog') {
    assigneeId = actorAsAssignee(actor);
    assigneeEmail = await userEmail(db, assigneeId);
  }

  const labelRows: Label[] = [];
  for (const ref of input.labels ?? []) {
    const label = await getLabelByNameOrId(db, ref);
    if (!labelRows.some((l) => l.id === label.id)) labelRows.push(label);
  }

  const id = ulid();
  const now = Date.now();
  const position = await nextPosition(db, list.id);
  const due = maybeParseDate(input.dueDate);

  db.transaction((tx) => {
    tx.insert(cards).values({
      id,
      projectId: project.id,
      listId: list.id,
      title: input.title,
      description: input.description ?? null,
      dueDate: due ?? null,
      position,
      assigneeId,
      completedAt: list.stage === 'done' ? now : null,
      createdAt: now,
      updatedAt: now,
    }).run();
    recordCardEvent(tx, { cardId: id, actor, type: 'created', to: stageName(list.stage), at: now });
    if (assigneeId) recordCardEvent(tx, { cardId: id, actor, type: 'assignee', to: assigneeEmail, at: now });
    for (const label of labelRows) {
      tx.insert(cardLabels).values({ cardId: id, labelId: label.id }).run();
      recordCardEvent(tx, { cardId: id, actor, type: 'label_added', to: label.name, at: now });
    }
  });

  return reloadCard(db, id);
}

export async function getCardById(db: Db, actor: Actor, id: string): Promise<CardDetails> {
  const card = await loadVisibleCard(db, actor, id);
  const labelRows = await db
    .select({ l: labels })
    .from(cardLabels)
    .innerJoin(labels, eq(cardLabels.labelId, labels.id))
    .where(eq(cardLabels.cardId, id));
  const assignee = card.assigneeId
    ? (await db
        .select({ id: users.id, name: users.name, email: users.email })
        .from(users)
        .where(eq(users.id, card.assigneeId)))[0] ?? null
    : null;
  const status = (await getBlockedStatuses(db, [id])).get(id)!;
  return { ...card, labels: labelRows.map((r) => r.l), ...status, assignee };
}

export async function updateCard(
  db: Db,
  actor: Actor,
  id: string,
  patch: { title?: string; description?: string | null; dueDate?: string | null },
): Promise<Card> {
  const card = await loadVisibleCard(db, actor, id);
  const next = {
    title: patch.title ?? card.title,
    description: patch.description !== undefined ? patch.description ?? null : card.description,
    dueDate: patch.dueDate !== undefined ? (patch.dueDate ? parseDate(patch.dueDate) : null) : card.dueDate,
  };
  const changes = [
    { type: 'title', from: card.title, to: next.title },
    { type: 'description', from: card.description, to: next.description },
    { type: 'due_date', from: card.dueDate, to: next.dueDate },
  ] as const;
  const changed = changes.filter((c) => c.from !== c.to);
  if (changed.length === 0) return card;

  const now = Date.now();
  db.transaction((tx) => {
    tx.update(cards).set({ ...next, updatedAt: now }).where(eq(cards.id, id)).run();
    for (const c of changed) recordCardEvent(tx, { cardId: id, actor, type: c.type, from: c.from, to: c.to, at: now });
  });
  return reloadCard(db, id);
}

export async function moveCard(
  db: Db,
  actor: Actor,
  id: string,
  target: { toProject?: string; toList: string; position?: number },
): Promise<void> {
  const card = await loadVisibleCard(db, actor, id);

  let targetProjectId = card.projectId;
  if (target.toProject) {
    targetProjectId = (await getProjectByNameOrId(db, target.toProject)).id;
    await assertProjectVisible(db, actor, targetProjectId);
  }
  const fromList = await loadList(db, card.listId);
  const toList = await resolveTargetList(db, targetProjectId, target.toList);
  const projectChanged = targetProjectId !== card.projectId;

  if (projectChanged && card.assigneeId) {
    // The current assignee must be an active member of the destination project.
    await resolveAssignee(db, targetProjectId, (await userEmail(db, card.assigneeId)) ?? card.assigneeId);
  }

  let assigneeId = card.assigneeId;
  let autoAssigneeEmail: string | null = null;
  if (toList.stage !== 'backlog' && !assigneeId) {
    assigneeId = actorAsAssignee(actor);
    autoAssigneeEmail = await userEmail(db, assigneeId);
  }

  const now = Date.now();
  const wasDone = fromList.stage === 'done';
  const isDone = toList.stage === 'done';
  const completedAt = isDone ? (wasDone ? card.completedAt ?? now : now) : null;
  // Feito is ordered by completion date, so a move into it ignores the requested position.
  const position = isDone || target.position === undefined ? await nextPosition(db, toList.id) : target.position;

  db.transaction((tx) => {
    tx.update(cards).set({
      projectId: targetProjectId,
      listId: toList.id,
      position,
      assigneeId,
      completedAt,
      updatedAt: now,
    }).where(eq(cards.id, id)).run();

    // Sync sprint slot position to match the card's new project position
    tx.update(sprintSlots).set({ position }).where(eq(sprintSlots.cardId, id)).run();

    if (projectChanged) {
      recordCardEvent(tx, { cardId: id, actor, type: 'project', from: card.projectId, to: targetProjectId, at: now });
    }
    if (fromList.stage !== toList.stage) {
      recordCardEvent(tx, { cardId: id, actor, type: 'stage', from: stageName(fromList.stage), to: stageName(toList.stage), at: now });
    }
    if (assigneeId !== card.assigneeId) {
      recordCardEvent(tx, { cardId: id, actor, type: 'assignee', from: null, to: autoAssigneeEmail, at: now });
    }
  });
}

export async function assignCard(db: Db, actor: Actor, id: string, assignee: string | null): Promise<Card> {
  const card = await loadVisibleCard(db, actor, id);
  let nextId: string | null = null;
  let nextEmail: string | null = null;
  if (assignee === null) {
    const list = await loadList(db, card.listId);
    if (list.stage !== 'backlog') throw new MartrelloError('ASSIGNEE_REQUIRED', ASSIGNEE_REQUIRED_MESSAGE);
  } else {
    const u = await resolveAssignee(db, card.projectId, assignee);
    nextId = u.id;
    nextEmail = u.email;
  }
  if (nextId === card.assigneeId) return card;

  const prevEmail = await userEmail(db, card.assigneeId);
  const now = Date.now();
  db.transaction((tx) => {
    tx.update(cards).set({ assigneeId: nextId, updatedAt: now }).where(eq(cards.id, id)).run();
    recordCardEvent(tx, { cardId: id, actor, type: 'assignee', from: prevEmail, to: nextEmail, at: now });
  });
  return reloadCard(db, id);
}

export async function archiveCard(db: Db, actor: Actor, id: string): Promise<void> {
  const card = await loadVisibleCard(db, actor, id);
  if (card.archivedAt != null) return;
  const now = Date.now();
  db.transaction((tx) => {
    tx.update(cards).set({ archivedAt: now, updatedAt: now }).where(eq(cards.id, id)).run();
    tx.delete(sprintSlots).where(eq(sprintSlots.cardId, id)).run();
    recordCardEvent(tx, { cardId: id, actor, type: 'archived', at: now });
  });
}

export async function unarchiveCard(db: Db, actor: Actor, id: string): Promise<void> {
  const card = await loadVisibleCard(db, actor, id);
  if (card.archivedAt == null) return;
  const now = Date.now();
  db.transaction((tx) => {
    tx.update(cards).set({ archivedAt: null, updatedAt: now }).where(eq(cards.id, id)).run();
    recordCardEvent(tx, { cardId: id, actor, type: 'unarchived', at: now });
  });
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
