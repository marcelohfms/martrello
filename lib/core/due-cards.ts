import { and, asc, eq, isNotNull, isNull, ne } from 'drizzle-orm';
import { cards, lists, users } from '@/lib/db/schema';
import type { Db } from './test-helpers';

export type DueCard = {
  title: string;
  dueDate: string;
  position: number;
  assigneeEmail: string | null;
  assigneeName: string | null;
};

/** Open cards with a due date: not archived, not in a 'done' list (Backlog included). */
export async function listDueCards(db: Db, projectId: string): Promise<DueCard[]> {
  const rows = await db
    .select({
      title: cards.title,
      dueDate: cards.dueDate,
      position: cards.position,
      assigneeEmail: users.email,
      assigneeName: users.name,
    })
    .from(cards)
    .innerJoin(lists, eq(cards.listId, lists.id))
    .leftJoin(users, eq(cards.assigneeId, users.id))
    .where(
      and(
        eq(cards.projectId, projectId),
        isNull(cards.archivedAt),
        isNotNull(cards.dueDate),
        ne(lists.stage, 'done'),
      ),
    )
    .orderBy(asc(cards.dueDate), asc(cards.position));
  return rows.map((r) => ({ ...r, dueDate: r.dueDate as string }));
}
