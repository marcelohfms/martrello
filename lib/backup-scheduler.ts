import path from 'node:path';
import { DB_PATH } from '@/lib/db/client';
import { isBackupDue, latestBackupTime, parseKeep, runBackup } from './backup';

const HOUR_MS = 60 * 60 * 1000;

export function startBackupScheduler(): void {
  const backupDir = process.env.BACKUP_DIR;
  if (!backupDir) return;
  const dir = path.resolve(backupDir);
  const keep = parseKeep(process.env.BACKUP_KEEP);

  const tick = async () => {
    try {
      if (!isBackupDue(latestBackupTime(dir), Date.now())) return;
      const { file, removed } = await runBackup({ dbPath: path.resolve(DB_PATH), backupDir: dir, keep });
      console.log(`[backup] ${file}${removed.length ? ` (removidos: ${removed.length})` : ''}`);
    } catch (e) {
      console.error(`[backup] falhou: ${(e as Error).message}`);
    }
  };

  void tick();
  setInterval(tick, HOUR_MS).unref();
}
