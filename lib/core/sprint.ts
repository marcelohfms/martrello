// lib/core/sprint.ts — the personal weekly sprint (Monday–Sunday, São Paulo).
// It has no columns of its own: it shows the person's cards in A fazer and Fazendo,
// plus those that reached Feito during the week. Sprints open and close by themselves.
import { and, asc, desc, eq, gte, inArray, isNull, lt, ne, or } from 'drizzle-orm';
import { ulid } from 'ulidx';
import { sprints, cards, lists, projects, labels, cardLabels, users, type Sprint } from '@/lib/db/schema';
import { MartrelloError } from '@/lib/errors';
import { actorUserId, type Actor } from '@/lib/access/actor';
import { visibleProjectIds } from '@/lib/access/guard';
import { getBlockedStatuses } from './dependencies';
import { sprintName, weekBounds, weekStartISO } from './week';
import type { Db } from './test-helpers';

export type SprintStage = 'todo' | 'doing' | 'done';
const SPRINT_STAGES: SprintStage[] = ['todo', 'doing', 'done'];

export type SprintCard = {
  id: string;
  title: string;
  projectId: string;
  projectName: string;
  projectAcronym: string;
  projectColor: string;
  stage: SprintStage;
  position: number;
  dueDate: string | null;
  labels: Array<{ name: string; color: string }>;
  isBlocked: boolean;
  completedAt: number | null;
};

/** Nearest deadline first; cards without a deadline go last; ties keep sprint position. */
export function compareByDeadline(
  a: { dueDate: string | null; position: number },
  b: { dueDate: string | null; position: number },
): number {
  if (a.dueDate !== b.dueDate) {
    if (a.dueDate === null) return 1;
    if (b.dueDate === null) return -1;
    return a.dueDate < b.dueDate ? -1 : 1;
  }
  return a.position - b.position;
}

function compareSprintCards(a: SprintCard, b: SprintCard): number {
  return SPRINT_STAGES.indexOf(a.stage) - SPRINT_STAGES.indexOf(b.stage) || compareByDeadline(a, b);
}

/**
 * A sprint as returned to callers. The raw `cardsSnapshot` JSON is never exposed: it holds every
 * card of the week, including projects the actor may no longer see; history filters it instead.
 */
export type SprintInfo = Omit<Sprint, 'cardsSnapshot'>;

function toInfo(row: Sprint): SprintInfo {
  const { cardsSnapshot: _raw, ...info } = row;
  return info;
}

function isUniqueViolation(e: unknown): boolean {
  const code = (x: unknown) => (x as { code?: unknown } | null)?.code;
  return code(e) === 'SQLITE_CONSTRAINT_UNIQUE' || code((e as { cause?: unknown } | null)?.cause) === 'SQLITE_CONSTRAINT_UNIQUE';
}

function requireUserId(actor: Actor): string {
  const id = actorUserId(actor);
  if (!id) throw new MartrelloError('FORBIDDEN', 'A sprint é pessoal: só um usuário tem sprint.');
  return id;
}

/**
 * The user's active cards (from active projects) in A fazer and Fazendo, plus those in Feito
 * completed within `[startMs, endMs)`. `projectIds` null means every project.
 */
async function loadUserCards(
  db: Db,
  userId: string,
  window: { startMs: number; endMs: number },
  projectIds: string[] | null,
): Promise<SprintCard[]> {
  if (projectIds !== null && projectIds.length === 0) return [];
  const rows = await db
    .select({ card: cards, project: projects, stage: lists.stage })
    .from(cards)
    .innerJoin(lists, eq(cards.listId, lists.id))
    .innerJoin(projects, eq(cards.projectId, projects.id))
    .where(and(
      eq(cards.assigneeId, userId),
      isNull(cards.archivedAt),
      isNull(projects.archivedAt),
      inArray(lists.stage, SPRINT_STAGES),
      or(
        ne(lists.stage, 'done'),
        and(gte(cards.completedAt, window.startMs), lt(cards.completedAt, window.endMs)),
      ),
      projectIds === null ? undefined : inArray(cards.projectId, projectIds),
    ));
  if (rows.length === 0) return [];

  const ids = rows.map((r) => r.card.id);
  const statuses = await getBlockedStatuses(db, ids);
  const labelRows = await db
    .select({ cardId: cardLabels.cardId, name: labels.name, color: labels.color })
    .from(cardLabels)
    .innerJoin(labels, eq(cardLabels.labelId, labels.id))
    .where(inArray(cardLabels.cardId, ids));

  return rows
    .map((r) => ({
      id: r.card.id,
      title: r.card.title,
      projectId: r.project.id,
      projectName: r.project.name,
      projectAcronym: r.project.acronym,
      projectColor: r.project.color,
      stage: r.stage as SprintStage,
      position: r.card.position,
      dueDate: r.card.dueDate,
      labels: labelRows.filter((l) => l.cardId === r.card.id).map((l) => ({ name: l.name, color: l.color })),
      isBlocked: statuses.get(r.card.id)?.isBlocked ?? false,
      completedAt: r.card.completedAt,
    }))
    .sort(compareSprintCards);
}

/**
 * Idempotent. Closes, with a snapshot, every open sprint of the user from an earlier week
 * (a legacy one without `weekStart` counts by its start date), then returns the sprint of
 * the current week, opening it if needed. A legacy open sprint started this week is adopted.
 */
export async function ensureCurrentSprint(db: Db, userId: string, now: Date = new Date()): Promise<Sprint> {
  try {
    return await openOrCloseSprints(db, userId, now);
  } catch (e) {
    // Another process opened the week's sprint between our check and insert: the retry finds it.
    if (!isUniqueViolation(e)) throw e;
    return openOrCloseSprints(db, userId, now);
  }
}

async function openOrCloseSprints(db: Db, userId: string, now: Date): Promise<Sprint> {
  const week = weekStartISO(now);
  const weekStartMs = weekBounds(week).startMs;
  const open = await db.select().from(sprints).where(and(eq(sprints.userId, userId), isNull(sprints.closedAt)));
  const stale = open.filter((s) => (s.weekStart ? s.weekStart < week : s.startedAt < weekStartMs));

  // Snapshots are read before the write transaction (the card queries are async).
  const snapshots = new Map<string, string>();
  for (const s of stale) {
    const window = s.weekStart ? weekBounds(s.weekStart) : { startMs: s.startedAt, endMs: weekStartMs };
    snapshots.set(s.id, JSON.stringify(await loadUserCards(db, userId, window, null)));
  }

  const at = now.getTime();
  return db.transaction((tx) => {
    for (const s of stale) {
      tx.update(sprints)
        .set({ closedAt: at, cardsSnapshot: snapshots.get(s.id)! })
        .where(and(eq(sprints.id, s.id), isNull(sprints.closedAt)))
        .run();
    }

    const current = tx.select().from(sprints)
      .where(and(eq(sprints.userId, userId), eq(sprints.weekStart, week))).get();
    if (current) return current;

    const legacy = tx.select().from(sprints)
      .where(and(
        eq(sprints.userId, userId),
        isNull(sprints.closedAt),
        isNull(sprints.weekStart),
        gte(sprints.startedAt, weekStartMs),
      ))
      .orderBy(asc(sprints.startedAt))
      .get();
    if (legacy) {
      const adopted = { weekStart: week, name: sprintName(week) };
      tx.update(sprints).set(adopted).where(eq(sprints.id, legacy.id)).run();
      return { ...legacy, ...adopted };
    }

    const row: Sprint = {
      id: ulid(), name: sprintName(week), startedAt: at, closedAt: null, cardsSnapshot: null, userId, weekStart: week,
    };
    tx.insert(sprints).values(row).run();
    return row;
  });
}

/** The actor's sprint of the current week, with its cards. */
export async function getMySprint(
  db: Db,
  actor: Actor,
  now: Date = new Date(),
): Promise<SprintInfo & { cards: SprintCard[] }> {
  const userId = requireUserId(actor);
  const sprint = await ensureCurrentSprint(db, userId, now);
  const cardsOfWeek = await loadUserCards(db, userId, weekBounds(weekStartISO(now)), await visibleProjectIds(db, actor));
  return { ...toInfo(sprint), cards: cardsOfWeek };
}

/**
 * Makes sure every active user has the sprint of the current week. One user's failure is logged
 * and does not stop the others. Returns how many users succeeded.
 */
export async function rolloverAllSprints(db: Db, now: Date = new Date()): Promise<number> {
  const active = await db.select({ id: users.id }).from(users).where(isNull(users.disabledAt));
  let ok = 0;
  for (const u of active) {
    try {
      await ensureCurrentSprint(db, u.id, now);
      ok += 1;
    } catch (e) {
      console.error(`[sprint] falha ao virar a semana de ${u.id}: ${(e as Error).message}`);
    }
  }
  return ok;
}

export async function listSprints(db: Db, actor: Actor, opts: { limit?: number } = {}): Promise<SprintInfo[]> {
  const userId = requireUserId(actor);
  const rows = await db.select().from(sprints)
    .where(eq(sprints.userId, userId))
    .orderBy(desc(sprints.startedAt), desc(sprints.id))
    .limit(opts.limit ?? 20);
  return rows.map(toInfo);
}

/** Snapshots written before the personal sprint carry `sprintList` instead of `stage`. */
function readSnapshotCard(raw: Partial<SprintCard> & { sprintList?: string }): SprintCard {
  const legacyStage = raw.sprintList === 'backlog' ? 'todo' : (raw.sprintList as SprintStage | undefined);
  return { ...raw, stage: raw.stage ?? legacyStage ?? 'todo', completedAt: raw.completedAt ?? null } as SprintCard;
}

/** One of the actor's own sprints; cards of projects the actor no longer sees are left out. */
export async function getSprintHistory(
  db: Db,
  actor: Actor,
  sprintId: string,
): Promise<SprintInfo & { cards: SprintCard[] }> {
  const userId = requireUserId(actor);
  const row = (await db.select().from(sprints)
    .where(and(eq(sprints.id, sprintId), eq(sprints.userId, userId))))[0];
  if (!row) throw new MartrelloError('SPRINT_NOT_FOUND', `Sprint ${sprintId} não existe`);
  const visible = await visibleProjectIds(db, actor);
  const snapshot = (row.cardsSnapshot ? JSON.parse(row.cardsSnapshot) : []) as Array<Parameters<typeof readSnapshotCard>[0]>;
  const cardsOfSprint = snapshot
    .map(readSnapshotCard)
    .filter((c) => visible === null || visible.includes(c.projectId));
  return { ...toInfo(row), cards: cardsOfSprint };
}
