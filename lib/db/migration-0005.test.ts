import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';
import { migrateTo } from './migrate-to';

describe('migration 0005', () => {
  it('0005 migra marcelo para admin com e-mail e mantém o hash', () => {
    const sqlite = new Database(':memory:');
    migrateTo(sqlite, '0004_bitter_dust');
    sqlite.prepare(`INSERT INTO users (id, username, password_hash, created_at) VALUES ('u1','marcelo','HASH',1)`).run();
    sqlite.prepare(`INSERT INTO users (id, username, password_hash, created_at) VALUES ('u2','outro','H2',1)`).run();
    migrateTo(sqlite, '0005');
    const m = sqlite.prepare(`SELECT * FROM users WHERE id='u1'`).get();
    expect(m).toMatchObject({ email: 'marcelo.ferro@axivero.com.br', name: 'Marcelo', role: 'admin', password_hash: 'HASH', disabled_at: null });
    expect(sqlite.prepare(`SELECT email, role FROM users WHERE id='u2'`).get()).toEqual({ email: 'outro', role: 'member' });
  });
});
