import { and, asc, count, eq, inArray, isNull, max, sql } from 'drizzle-orm';
import { ulid } from 'ulidx';
import { projects, lists, cards, projectMembers, type Project, type List } from '@/lib/db/schema';
import { MartrelloError, suggestClosest } from '@/lib/errors';
import { POSITION_STEP, renumber } from './positions';
import type { Db } from './test-helpers';
import { suggestAcronym } from './acronym';
import { STAGES } from './stages';
import type { Actor } from '@/lib/access/actor';
import { assertAdmin, visibleProjectIds } from '@/lib/access/guard';


export const PROJECT_COLOR_PALETTE = [
  '#8a9a5b', '#6b8e4e', '#a3b18a', '#588157',
  '#3a5a40', '#344e41', '#9db380',
] as const;

export async function createProject(
  db: Db,
  actor: Actor,
  input: { name: string; color?: string; acronym?: string },
): Promise<Project> {
  assertAdmin(actor);
  const existing = await db.select().from(projects).where(eq(projects.name, input.name));
  if (existing.length > 0) {
    throw new MartrelloError('NAME_CONFLICT', `Já existe projeto chamado '${input.name}'`);
  }

  const trimmedAcronym = input.acronym?.trim();
  const acronym = (trimmedAcronym || suggestAcronym(input.name)).toUpperCase();
  const acronymConflict = await db.select().from(projects).where(eq(projects.acronym, acronym));
  if (acronymConflict.length > 0) {
    throw new MartrelloError('NAME_CONFLICT', `Já existe projeto com o acrônimo '${acronym}'`);
  }

  const maxPos = (await db.select({ m: max(projects.position) }).from(projects))[0]?.m ?? 0;
  const totalCount = (await db.select({ c: count() }).from(projects))[0]?.c ?? 0;
  const color = input.color ?? PROJECT_COLOR_PALETTE[Number(totalCount) % PROJECT_COLOR_PALETTE.length];
  const id = ulid();
  const now = Date.now();

  db.transaction((tx) => {
    tx.insert(projects).values({
      id,
      name: input.name,
      acronym,
      color,
      position: maxPos + POSITION_STEP,
      createdAt: now,
    }).run();
    for (let i = 0; i < STAGES.length; i++) {
      tx.insert(lists).values({
        id: ulid(),
        projectId: id,
        name: STAGES[i].name,
        stage: STAGES[i].stage,
        position: POSITION_STEP * i,
        createdAt: now,
      }).run();
    }
    // The creating admin is always a member; a system actor has no user to add.
    if (actor.kind === 'user') {
      tx.insert(projectMembers).values({ projectId: id, userId: actor.id, addedAt: now }).run();
    }
  });

  const row = (await db.select().from(projects).where(eq(projects.id, id)))[0];
  return row;
}

export async function listProjects(
  db: Db,
  actor: Actor,
  opts: { includeArchived?: boolean } = {},
): Promise<Array<Project & { listCount: number; cardCount: number }>> {
  const visible = await visibleProjectIds(db, actor);
  const baseQuery = db.select().from(projects).orderBy(asc(projects.position));
  const conditions = [];
  if (!opts.includeArchived) conditions.push(isNull(projects.archivedAt));
  if (visible !== null) conditions.push(inArray(projects.id, visible));
  const projectRows = conditions.length > 0 ? await baseQuery.where(and(...conditions)) : await baseQuery;

  const listCountRows = await db
    .select({ projectId: lists.projectId, c: count() })
    .from(lists)
    .groupBy(lists.projectId);
  const cardCountRows = await db
    .select({ projectId: cards.projectId, c: count() })
    .from(cards)
    .where(isNull(cards.archivedAt))
    .groupBy(cards.projectId);

  const listCountByProject = new Map(listCountRows.map((r) => [r.projectId, Number(r.c)]));
  const cardCountByProject = new Map(cardCountRows.map((r) => [r.projectId, Number(r.c)]));

  return projectRows.map((p) => ({
    ...p,
    listCount: listCountByProject.get(p.id) ?? 0,
    cardCount: cardCountByProject.get(p.id) ?? 0,
  }));
}

/**
 * Internal lookup by id or name. `visibleIds` (null = everything) scopes both the match and the
 * name suggestions, so an invisible project is indistinguishable from a nonexistent one.
 * Callers acting for a user go through `getProject`.
 */
export async function getProjectByNameOrId(
  db: Db,
  nameOrId: string,
  visibleIds: string[] | null = null,
): Promise<Project & { lists: List[] }> {
  const scope = visibleIds === null ? undefined : inArray(projects.id, visibleIds);
  const found =
    (await db.select().from(projects).where(and(eq(projects.id, nameOrId), scope)))[0] ??
    (await db.select().from(projects).where(and(eq(projects.name, nameOrId), scope)))[0];

  if (!found) {
    const all = await db.select({ name: projects.name }).from(projects).where(scope);
    throw new MartrelloError(
      'PROJECT_NOT_FOUND',
      `Projeto '${nameOrId}' não existe`,
      suggestClosest(nameOrId, all.map((r) => r.name)),
    );
  }

  const listRows = await db
    .select()
    .from(lists)
    .where(eq(lists.projectId, found.id))
    .orderBy(asc(lists.position));

  return { ...found, lists: listRows };
}

/** Public lookup: only projects the actor can see. */
export async function getProject(
  db: Db,
  actor: Actor,
  nameOrId: string,
): Promise<Project & { lists: List[] }> {
  return getProjectByNameOrId(db, nameOrId, await visibleProjectIds(db, actor));
}

export async function updateProject(
  db: Db,
  actor: Actor,
  id: string,
  patch: { name?: string; color?: string; acronym?: string },
): Promise<Project> {
  assertAdmin(actor);
  if (patch.name) {
    const conflict = await db
      .select()
      .from(projects)
      .where(and(eq(projects.name, patch.name), sql`${projects.id} != ${id}`));
    if (conflict.length > 0) {
      throw new MartrelloError('NAME_CONFLICT', `Já existe projeto '${patch.name}'`);
    }
  }

  const normalizedPatch: { name?: string; color?: string; acronym?: string } = { ...patch };
  if (patch.acronym) {
    normalizedPatch.acronym = patch.acronym.toUpperCase();
    const conflict = await db
      .select()
      .from(projects)
      .where(and(eq(projects.acronym, normalizedPatch.acronym), sql`${projects.id} != ${id}`));
    if (conflict.length > 0) {
      throw new MartrelloError('NAME_CONFLICT', `Já existe projeto com o acrônimo '${normalizedPatch.acronym}'`);
    }
  } else if (patch.acronym === '') {
    // An empty-string acronym means "no change requested" — same treatment as
    // undefined, so it never reaches the DB and bypasses the uniqueness check above.
    delete normalizedPatch.acronym;
  }

  if (Object.keys(normalizedPatch).length > 0) {
    await db.update(projects).set(normalizedPatch).where(eq(projects.id, id));
  }

  const row = (await db.select().from(projects).where(eq(projects.id, id)))[0];
  if (!row) throw new MartrelloError('PROJECT_NOT_FOUND', `Projeto ${id} não existe`);
  return row;
}

export async function archiveProject(db: Db, actor: Actor, id: string): Promise<void> {
  assertAdmin(actor);
  const found = (await db.select().from(projects).where(eq(projects.id, id)))[0];
  if (!found) throw new MartrelloError('PROJECT_NOT_FOUND', `Projeto ${id} não existe`);
  await db.update(projects).set({ archivedAt: Date.now() }).where(eq(projects.id, id));
}

export async function reorderProjects(db: Db, actor: Actor, orderedIds: string[]): Promise<void> {
  assertAdmin(actor);
  db.transaction((tx) => {
    const renumbered = renumber(orderedIds);
    for (const r of renumbered) {
      tx.update(projects).set({ position: r.position }).where(eq(projects.id, r.id)).run();
    }
  });
}

export async function setProjectSlackChannel(
  db: Db,
  actor: Actor,
  projectId: string,
  channel: { id: string; name: string } | null,
): Promise<void> {
  assertAdmin(actor);
  const found = (await db.select().from(projects).where(eq(projects.id, projectId)))[0];
  if (!found) throw new MartrelloError('PROJECT_NOT_FOUND', `Projeto ${projectId} não existe`);
  await db
    .update(projects)
    .set({ slackChannelId: channel?.id ?? null, slackChannelName: channel?.name ?? null })
    .where(eq(projects.id, projectId));
}
