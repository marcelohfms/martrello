export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  if (!process.env.BACKUP_DIR) return;
  const { startBackupScheduler } = await import('./lib/backup-scheduler');
  startBackupScheduler();
}
