// scripts/migrate.ts
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { getDb, closeDb } from '@/lib/db/client';

function main() {
  const db = getDb();
  migrate(db, { migrationsFolder: './lib/db/migrations' });
  console.log('migrations applied');
  closeDb();
}

main();
