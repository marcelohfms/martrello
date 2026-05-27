import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import * as schema from '@/lib/db/schema';

let sqlite: Database.Database;
let db: ReturnType<typeof drizzle<typeof schema>>;

beforeAll(() => {
  sqlite = new Database(':memory:');
  sqlite.pragma('foreign_keys = ON');
  db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: './lib/db/migrations' });
});

afterAll(() => sqlite.close());

describe('db smoke', () => {
  it('inserts and reads a project', async () => {
    await db.insert(schema.projects).values({
      id: 'p1',
      name: 'test',
      color: '#fff',
      position: 0,
      createdAt: Date.now(),
    });
    const rows = await db.select().from(schema.projects);
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe('test');
  });
});
