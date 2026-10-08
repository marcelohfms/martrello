import Database from 'better-sqlite3';
import { mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import path from 'node:path';

const PREFIX = 'martrello-';
const SUFFIX = '.db';
const DAY_MS = 24 * 60 * 60 * 1000;

export function backupFileName(date: Date): string {
  return `${PREFIX}${date.toISOString().replace(/[:.]/g, '-')}${SUFFIX}`;
}

export function listBackups(dir: string): string[] {
  let names: string[];
  try {
    names = readdirSync(dir);
  } catch {
    return [];
  }
  return names.filter((n) => n.startsWith(PREFIX) && n.endsWith(SUFFIX)).sort();
}

export function pruneBackups(dir: string, keep: number): string[] {
  const all = listBackups(dir);
  const excess = all.slice(0, Math.max(0, all.length - keep));
  for (const name of excess) rmSync(path.join(dir, name), { force: true });
  return excess;
}

export function latestBackupTime(dir: string): number | null {
  const all = listBackups(dir);
  const newest = all[all.length - 1];
  return newest ? statSync(path.join(dir, newest)).mtimeMs : null;
}

export function isBackupDue(latestMs: number | null, nowMs: number, intervalMs: number = DAY_MS): boolean {
  return latestMs === null || nowMs - latestMs >= intervalMs;
}

export async function runBackup(opts: {
  dbPath: string;
  backupDir: string;
  keep: number;
  now?: Date;
}): Promise<{ file: string; removed: string[] }> {
  mkdirSync(opts.backupDir, { recursive: true });
  const file = path.join(opts.backupDir, backupFileName(opts.now ?? new Date()));
  const source = new Database(opts.dbPath, { fileMustExist: true });
  try {
    await source.backup(file);
  } finally {
    source.close();
  }
  return { file, removed: pruneBackups(opts.backupDir, opts.keep) };
}
