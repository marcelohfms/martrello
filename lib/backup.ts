import Database from 'better-sqlite3';
import { mkdirSync, readdirSync, renameSync, rmSync, statSync } from 'node:fs';
import path from 'node:path';

const PREFIX = 'martrello-';
const SUFFIX = '.db';
const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_KEEP = 14;

export function parseKeep(raw: string | undefined): number {
  const trimmed = raw?.trim() ?? '';
  const n = Number(trimmed);
  return trimmed !== '' && Number.isInteger(n) && n >= 1 ? n : DEFAULT_KEEP;
}

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
  if (!Number.isInteger(keep) || keep < 1) throw new Error('keep must be an integer >= 1');
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
  const tmp = `${file}.tmp`;
  const source = new Database(opts.dbPath, { fileMustExist: true });
  try {
    await source.backup(tmp);
    renameSync(tmp, file);
  } catch (e) {
    rmSync(tmp, { force: true });
    throw e;
  } finally {
    source.close();
  }
  return { file, removed: pruneBackups(opts.backupDir, opts.keep) };
}
