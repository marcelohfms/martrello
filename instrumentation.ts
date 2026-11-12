export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  const { startSprintScheduler } = await import('./lib/sprint-scheduler');
  startSprintScheduler();
  if (!process.env.BACKUP_DIR) return;
  const { startBackupScheduler } = await import('./lib/backup-scheduler');
  startBackupScheduler();
}
