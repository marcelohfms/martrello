import { copyFileSync, mkdirSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

const SRC = path.resolve('./martrello.db');
const DST_DIR = path.join(
  homedir(),
  'Library', 'Mobile Documents', 'com~apple~CloudDocs', 'martrello', 'backups',
);

if (!existsSync(SRC)) {
  console.error(`No DB at ${SRC}; run pnpm db:migrate first.`);
  process.exit(1);
}

mkdirSync(DST_DIR, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 16);
const dst = path.join(DST_DIR, `martrello-${stamp}.db`);
copyFileSync(SRC, dst);
console.log(`backup → ${dst}`);
