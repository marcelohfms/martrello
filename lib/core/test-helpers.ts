import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import type { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core';
import type { RunResult } from 'better-sqlite3';
import * as schema from '@/lib/db/schema';
import { users, projectMembers, type Role, type User } from '@/lib/db/schema';
import type { Actor } from '@/lib/access/actor';

export type Db = ReturnType<typeof drizzle<typeof schema>>;

export function makeTestDb(): { db: Db; close: () => void } {
  const sqlite = new Database(':memory:');
  sqlite.pragma('foreign_keys = ON');
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: './lib/db/migrations' });
  return { db, close: () => sqlite.close() };
}

let userSeq = 0;

export async function makeUser(
  db: Db,
  opts: { email?: string; name?: string; role?: Role } = {},
): Promise<{ user: User; actor: Actor }> {
  const n = ++userSeq;
  const row = {
    id: `u-test-${n}`,
    email: opts.email ?? `user${n}@test.local`,
    name: opts.name ?? `User ${n}`,
    passwordHash: 'x-dummy-hash',
    role: opts.role ?? ('member' as Role),
    createdAt: Date.now(),
    disabledAt: null,
  };
  db.insert(users).values(row).run();
  return { user: row, actor: { kind: 'user', id: row.id, role: row.role } };
}

export function addMemberRow(db: Db, projectId: string, userId: string): void {
  db.insert(projectMembers).values({ projectId, userId, addedAt: Date.now() }).run();
}

/** A sync drizzle handle: the database itself or a transaction opened on it. */
export type SyncDb = BaseSQLiteDatabase<'sync', RunResult, typeof schema>;
