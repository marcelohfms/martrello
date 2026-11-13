import { and, eq, isNotNull, isNull, sql } from 'drizzle-orm';
import { projects, slackDeliveries, type DeliveryStatus } from '@/lib/db/schema';
import type { Db } from './test-helpers';

export type ProjectDeliveryStatus = {
  latest: { day: string; status: DeliveryStatus; error: string | null; at: number } | null;
  lastSentAt: number | null;
};

export async function listDigestTargets(
  db: Db,
): Promise<{ id: string; name: string; channelId: string }[]> {
  const rows = await db
    .select({ id: projects.id, name: projects.name, channelId: projects.slackChannelId })
    .from(projects)
    .where(and(isNull(projects.archivedAt), isNotNull(projects.slackChannelId)))
    .orderBy(projects.position);
  return rows.map((r) => ({ id: r.id, name: r.name, channelId: r.channelId as string }));
}

/** Synchronous on purpose: the check-and-reserve must be atomic in SQLite. */
export function claimDelivery(db: Db, projectId: string, day: string, now: number): boolean {
  const inserted = db
    .insert(slackDeliveries)
    .values({ projectId, day, status: 'sending', attempts: 1, error: null, updatedAt: now })
    .onConflictDoNothing()
    .run();
  if (inserted.changes > 0) return true;
  const updated = db
    .update(slackDeliveries)
    .set({ status: 'sending', attempts: sql`${slackDeliveries.attempts} + 1`, updatedAt: now })
    .where(
      and(
        eq(slackDeliveries.projectId, projectId),
        eq(slackDeliveries.day, day),
        eq(slackDeliveries.status, 'retry'),
      ),
    )
    .run();
  return updated.changes > 0;
}

export function finishDelivery(
  db: Db,
  projectId: string,
  day: string,
  status: 'sent' | 'empty' | 'retry' | 'failed',
  error: string | null,
  now: number,
): void {
  db.update(slackDeliveries)
    .set({ status, error, updatedAt: now })
    .where(and(eq(slackDeliveries.projectId, projectId), eq(slackDeliveries.day, day)))
    .run();
}

/** After a restart, a 'sending' row is ambiguous (may or may not have been posted): never resend. */
export function failStaleSending(db: Db, day: string, now: number): number {
  return db
    .update(slackDeliveries)
    .set({ status: 'failed', error: 'interrupted', updatedAt: now })
    .where(and(eq(slackDeliveries.day, day), eq(slackDeliveries.status, 'sending')))
    .run().changes;
}

export async function deliveryStatuses(db: Db): Promise<Map<string, ProjectDeliveryStatus>> {
  const rows = await db.select().from(slackDeliveries).orderBy(slackDeliveries.day);
  const out = new Map<string, ProjectDeliveryStatus>();
  for (const r of rows) {
    const cur = out.get(r.projectId) ?? { latest: null, lastSentAt: null };
    cur.latest = { day: r.day, status: r.status, error: r.error, at: r.updatedAt };
    if (r.status === 'sent') cur.lastSentAt = r.updatedAt;
    out.set(r.projectId, cur);
  }
  return out;
}
