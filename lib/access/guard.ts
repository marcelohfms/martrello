import { eq } from 'drizzle-orm';
import { cards, projectMembers, type Card } from '@/lib/db/schema';
import { MartrelloError } from '@/lib/errors';
import type { Db } from '@/lib/core/test-helpers';
import type { Actor } from './actor';

export function seesAllProjects(a: Actor): boolean {
  return a.kind === 'system' || a.role === 'admin';
}

/** `null` means every project is visible. */
export async function visibleProjectIds(db: Db, a: Actor): Promise<string[] | null> {
  if (seesAllProjects(a)) return null;
  if (a.kind !== 'user') return null;
  const rows = await db
    .select({ projectId: projectMembers.projectId })
    .from(projectMembers)
    .where(eq(projectMembers.userId, a.id));
  return rows.map((r) => r.projectId);
}

export async function assertProjectVisible(db: Db, a: Actor, projectId: string): Promise<void> {
  const ids = await visibleProjectIds(db, a);
  if (ids !== null && !ids.includes(projectId)) {
    throw new MartrelloError('PROJECT_NOT_FOUND', `Projeto '${projectId}' não encontrado`);
  }
}

export async function loadVisibleCard(db: Db, a: Actor, cardId: string): Promise<Card> {
  const card = (await db.select().from(cards).where(eq(cards.id, cardId)).limit(1))[0];
  const notFound = () => new MartrelloError('CARD_NOT_FOUND', `Card '${cardId}' não encontrado`);
  if (!card) throw notFound();
  const ids = await visibleProjectIds(db, a);
  if (ids !== null && !ids.includes(card.projectId)) throw notFound();
  return card;
}

export function assertAdmin(a: Actor): void {
  if (!seesAllProjects(a)) throw new MartrelloError('FORBIDDEN', 'Só o admin pode fazer isso.');
}
