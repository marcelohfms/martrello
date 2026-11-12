import { and, asc, eq, isNull } from 'drizzle-orm';
import { users } from '@/lib/db/schema';
import type { Db } from '@/lib/core/test-helpers';
import type { Actor } from './actor';

/** The oldest active admin, used by the shared MCP_TOKEN and the local stdio MCP. */
export async function firstAdminActor(db: Db): Promise<Actor | null> {
  const row = (await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.role, 'admin'), isNull(users.disabledAt)))
    .orderBy(asc(users.createdAt), asc(users.id))
    .limit(1))[0];
  return row ? { kind: 'user', id: row.id, role: 'admin' } : null;
}
