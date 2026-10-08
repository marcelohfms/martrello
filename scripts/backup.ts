// scripts/backup.ts — manual backup. BACKUP_DIR (default ./backups), BACKUP_KEEP (default 14).
import path from 'node:path';
import { DB_PATH } from '@/lib/db/client';
import { parseKeep, runBackup } from '@/lib/backup';

runBackup({
  dbPath: path.resolve(DB_PATH),
  backupDir: path.resolve(process.env.BACKUP_DIR || './backups'),
  keep: parseKeep(process.env.BACKUP_KEEP),
})
  .then(({ file, removed }) => {
    console.log(`backup → ${file}`);
    if (removed.length) console.log(`removidos: ${removed.join(', ')}`);
  })
  .catch((e) => {
    console.error(`backup falhou: ${(e as Error).message}`);
    process.exit(1);
  });
