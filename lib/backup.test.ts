import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { backupFileName, listBackups, pruneBackups, runBackup, isBackupDue } from './backup';

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'mt-backup-'));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

const DAY = 24 * 60 * 60 * 1000;

describe('backup', () => {
  it('file names sort chronologically', () => {
    const a = backupFileName(new Date('2026-01-02T03:04:05.006Z'));
    const b = backupFileName(new Date('2026-01-10T00:00:00.000Z'));
    expect(a).toBe('martrello-2026-01-02T03-04-05-006Z.db');
    expect([b, a].sort()).toEqual([a, b]);
  });

  it('runBackup produces a consistent copy of the database', async () => {
    const src = path.join(dir, 'live.db');
    const live = new Database(src);
    live.pragma('journal_mode = WAL');
    live.exec("CREATE TABLE t (v TEXT); INSERT INTO t VALUES ('hello');");
    live.close();

    const out = path.join(dir, 'backups');
    const { file } = await runBackup({ dbPath: src, backupDir: out, keep: 14, now: new Date('2026-10-08T03:00:00Z') });

    const copy = new Database(file, { readonly: true });
    expect(copy.prepare('SELECT v FROM t').get()).toEqual({ v: 'hello' });
    copy.close();
  });

  it('prune only touches martrello-*.db files', () => {
    for (let i = 1; i <= 16; i++) {
      writeFileSync(path.join(dir, backupFileName(new Date(Date.UTC(2026, 0, i)))), '');
    }
    writeFileSync(path.join(dir, 'notes.txt'), 'keep me');
    writeFileSync(path.join(dir, 'other.db'), 'keep me');

    const removed = pruneBackups(dir, 14);

    expect(removed).toEqual([
      backupFileName(new Date(Date.UTC(2026, 0, 1))),
      backupFileName(new Date(Date.UTC(2026, 0, 2))),
    ]);
    expect(listBackups(dir)).toHaveLength(14);
    expect(readdirSync(dir)).toEqual(expect.arrayContaining(['notes.txt', 'other.db']));
  });

  it('isBackupDue: no backup yet, stale, and fresh', () => {
    expect(isBackupDue(null, 0)).toBe(true);
    expect(isBackupDue(0, DAY)).toBe(true);
    expect(isBackupDue(0, DAY - 1)).toBe(false);
  });
});
