import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import * as schema from '@/lib/db/schema';

export type Db = ReturnType<typeof drizzle<typeof schema>>;

export function makeTestDb(): { db: Db; close: () => void } {
  const sqlite = new Database(':memory:');
  sqlite.pragma('foreign_keys = ON');
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: './lib/db/migrations' });
  return { db, close: () => sqlite.close() };
}
