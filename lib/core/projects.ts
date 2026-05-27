import { and, asc, eq, isNull, max, sql } from 'drizzle-orm';
import { ulid } from 'ulidx';
import { projects, lists, type Project, type List } from '@/lib/db/schema';
import { MartrelloError, suggestClosest } from '@/lib/errors';
import { POSITION_STEP, renumber } from './positions';
import type { Db } from './test-helpers';

export const DEFAULT_LISTS = ['A fazer', 'Fazendo', 'Feito'] as const;
export const DEFAULT_COLOR = '#64748b';

export async function createProject(
  db: Db,
  input: { name: string; color?: string; lists?: string[] },
): Promise<Project> {
  const existing = await db.select().from(projects).where(eq(projects.name, input.name));
  if (existing.length > 0) {
    throw new MartrelloError('NAME_CONFLICT', `Já existe projeto chamado '${input.name}'`);
  }

  const maxPos = (await db.select({ m: max(projects.position) }).from(projects))[0]?.m ?? 0;
  const id = ulid();
  const now = Date.now();
  const listNames = input.lists?.length ? input.lists : [...DEFAULT_LISTS];

  db.transaction((tx) => {
    tx.insert(projects).values({
      id,
      name: input.name,
      color: input.color ?? DEFAULT_COLOR,
      position: maxPos + POSITION_STEP,
      createdAt: now,
    }).run();
    for (let i = 0; i < listNames.length; i++) {
      tx.insert(lists).values({
        id: ulid(),
        projectId: id,
        name: listNames[i],
        position: POSITION_STEP * (i + 1),
        createdAt: now,
      }).run();
    }
  });

  const row = (await db.select().from(projects).where(eq(projects.id, id)))[0];
  return row;
}

export async function listProjects(
  db: Db,
  opts: { includeArchived?: boolean } = {},
): Promise<Array<Project & { listCount: number; cardCount: number }>> {
  const baseQuery = db
    .select({
      project: projects,
      listCount: sql<number>`(SELECT COUNT(*) FROM ${lists} WHERE ${lists.projectId} = ${projects.id})`,
      cardCount: sql<number>`(SELECT COUNT(*) FROM cards WHERE cards.project_id = ${projects.id} AND cards.archived_at IS NULL)`,
    })
    .from(projects)
    .orderBy(asc(projects.position));

  const rows = opts.includeArchived
    ? await baseQuery
    : await baseQuery.where(isNull(projects.archivedAt));

  return rows.map((r) => ({ ...r.project, listCount: Number(r.listCount), cardCount: Number(r.cardCount) }));
}

export async function getProjectByNameOrId(
  db: Db,
  nameOrId: string,
): Promise<Project & { lists: List[] }> {
  const found =
    (await db.select().from(projects).where(eq(projects.id, nameOrId)))[0] ??
    (await db.select().from(projects).where(eq(projects.name, nameOrId)))[0];

  if (!found) {
    const all = await db.select({ name: projects.name }).from(projects);
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

export async function updateProject(
  db: Db,
  id: string,
  patch: { name?: string; color?: string },
): Promise<Project> {
  if (patch.name) {
    const conflict = await db
      .select()
      .from(projects)
      .where(and(eq(projects.name, patch.name), sql`${projects.id} != ${id}`));
    if (conflict.length > 0) {
      throw new MartrelloError('NAME_CONFLICT', `Já existe projeto '${patch.name}'`);
    }
  }

  await db.update(projects).set(patch).where(eq(projects.id, id));

  const row = (await db.select().from(projects).where(eq(projects.id, id)))[0];
  if (!row) throw new MartrelloError('PROJECT_NOT_FOUND', `Projeto ${id} não existe`);
  return row;
}

export async function archiveProject(db: Db, id: string): Promise<void> {
  const found = (await db.select().from(projects).where(eq(projects.id, id)))[0];
  if (!found) throw new MartrelloError('PROJECT_NOT_FOUND', `Projeto ${id} não existe`);
  await db.update(projects).set({ archivedAt: Date.now() }).where(eq(projects.id, id));
}

export async function reorderProjects(db: Db, orderedIds: string[]): Promise<void> {
  db.transaction((tx) => {
    const renumbered = renumber(orderedIds);
    for (const r of renumbered) {
      tx.update(projects).set({ position: r.position }).where(eq(projects.id, r.id)).run();
    }
  });
}
