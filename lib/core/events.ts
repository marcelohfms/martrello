import { asc, eq } from 'drizzle-orm';
import { monotonicFactory } from 'ulidx';
import { cardEvents, users } from '@/lib/db/schema';
import { actorUserId, type Actor } from '@/lib/access/actor';
import { loadVisibleCard } from '@/lib/access/guard';
import type { Db, SyncDb } from './test-helpers';

// Monotonic so events recorded in the same millisecond keep their insertion order.
const eventId = monotonicFactory();

export type CardEventType =
  | 'created' | 'title' | 'description' | 'due_date' | 'stage' | 'project' | 'assignee'
  | 'label_added' | 'label_removed' | 'dependency_added' | 'dependency_removed'
  | 'archived' | 'unarchived' | 'migrated';

/** Synchronous (.run()) so it can be called inside `db.transaction((tx) => ...)`. */
export function recordCardEvent(
  db: SyncDb,
  e: { cardId: string; actor: Actor; type: CardEventType; from?: string | null; to?: string | null; at?: number },
): void {
  db.insert(cardEvents)
    .values({
      id: eventId(),
      cardId: e.cardId,
      actorId: actorUserId(e.actor),
      type: e.type,
      fromValue: e.from ?? null,
      toValue: e.to ?? null,
      at: e.at ?? Date.now(),
    })
    .run();
}

export async function listCardEvents(
  db: Db,
  actor: Actor,
  cardId: string,
): Promise<Array<{ id: string; type: CardEventType; from: string | null; to: string | null; at: number; actorName: string | null }>> {
  await loadVisibleCard(db, actor, cardId);
  const rows = await db
    .select({
      id: cardEvents.id,
      type: cardEvents.type,
      from: cardEvents.fromValue,
      to: cardEvents.toValue,
      at: cardEvents.at,
      actorName: users.name,
    })
    .from(cardEvents)
    .leftJoin(users, eq(users.id, cardEvents.actorId))
    .where(eq(cardEvents.cardId, cardId))
    .orderBy(asc(cardEvents.at), asc(cardEvents.id));
  return rows.map((r) => ({ ...r, type: r.type as CardEventType }));
}
