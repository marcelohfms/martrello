// lib/db/migrate-to.ts — apply migrations only up to a given journal tag (prefix match).
// Used by migration tests to build a database at an older schema version.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';

const MIGRATIONS_DIR = path.resolve(process.cwd(), 'lib/db/migrations');

export function migrateTo(sqlite: Database.Database, lastTag: string): void {
  const journal = JSON.parse(fs.readFileSync(path.join(MIGRATIONS_DIR, 'meta/_journal.json'), 'utf8'));
  const idx = journal.entries.findIndex((e: { tag: string }) => e.tag.startsWith(lastTag));
  if (idx === -1) throw new Error(`migration tag not found: ${lastTag}`);
  journal.entries = journal.entries.slice(0, idx + 1);

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'martrello-migrate-'));
  try {
    fs.mkdirSync(path.join(tmp, 'meta'));
    for (const e of journal.entries) {
      fs.copyFileSync(path.join(MIGRATIONS_DIR, `${e.tag}.sql`), path.join(tmp, `${e.tag}.sql`));
    }
    fs.writeFileSync(path.join(tmp, 'meta/_journal.json'), JSON.stringify(journal));
    migrate(drizzle(sqlite), { migrationsFolder: tmp });
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}
