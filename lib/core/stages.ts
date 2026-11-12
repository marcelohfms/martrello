// lib/core/stages.ts — the four fixed stages every project has.
import { and, eq } from 'drizzle-orm';
import { lists, type List, type Stage } from '@/lib/db/schema';
import { MartrelloError, suggestClosest } from '@/lib/errors';
import type { Db } from './test-helpers';

export type { Stage };

export const STAGES: ReadonlyArray<{ stage: Stage; name: string }> = [
  { stage: 'backlog', name: 'Backlog' },
  { stage: 'todo', name: 'A fazer' },
  { stage: 'doing', name: 'Fazendo' },
  { stage: 'done', name: 'Feito' },
];

export async function getStageList(db: Db, projectId: string, stage: Stage): Promise<List> {
  const found = (await db.select().from(lists).where(and(eq(lists.projectId, projectId), eq(lists.stage, stage))))[0];
  if (!found) throw new MartrelloError('LIST_NOT_FOUND', `Projeto não tem a etapa '${stage}'`);
  return found;
}

/** Accepts a list id, a list name, or a stage name/key. */
export async function resolveListRef(db: Db, projectId: string, ref: string): Promise<List> {
  const rows = await db.select().from(lists).where(eq(lists.projectId, projectId));
  const found =
    rows.find((l) => l.id === ref) ??
    rows.find((l) => l.name === ref) ??
    rows.find((l) => l.stage === ref) ??
    (() => {
      const s = STAGES.find((x) => x.name === ref);
      return s ? rows.find((l) => l.stage === s.stage) : undefined;
    })();
  if (!found) {
    throw new MartrelloError(
      'LIST_NOT_FOUND',
      `Lista '${ref}' não existe nesse projeto`,
      suggestClosest(ref, rows.map((r) => r.name)),
    );
  }
  return found;
}
