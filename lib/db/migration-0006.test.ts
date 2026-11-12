import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { migrateTo } from './migrate-to';

let sqlite: Database.Database;
const q = (sql: string, ...a: unknown[]) => sqlite.prepare(sql).all(...a) as any[];

function seedBase(extraList?: string) {
  sqlite.exec(`
    INSERT INTO users (id, email, name, password_hash, role, created_at) VALUES ('u1','marcelo.ferro@axivero.com.br','Marcelo','H','admin',1);
    INSERT INTO projects (id, name, acronym, color, position, created_at) VALUES ('P','P','P','#000',1000,1);
    INSERT INTO lists (id, project_id, name, position, created_at) VALUES
      ('l1','P','A fazer',1000,1),('l2','P','Fazendo',2000,1),('l3','P','Feito',3000,1);
    INSERT INTO cards (id, project_id, list_id, title, position, created_at, updated_at, archived_at) VALUES
      ('c1','P','l1','um',1000,1,10,NULL),
      ('c2','P','l3','dois',2000,1,50,NULL),
      ('c3','P','l2','tres',3000,1,20,5);
    INSERT INTO sprints (id, name, started_at) VALUES ('S','s',1);
  `);
  if (extraList) {
    sqlite.prepare(`INSERT INTO lists (id, project_id, name, position, created_at) VALUES ('lx','P',?,4000,1)`).run(extraList);
  }
}

beforeEach(() => {
  sqlite = new Database(':memory:');
  sqlite.pragma('foreign_keys = ON');
  migrateTo(sqlite, '0005');
});

describe('migration 0006', () => {
  it('0006 cria Backlog, etapas, responsável, membros, sprint e eventos', () => {
    seedBase();
    migrateTo(sqlite, '0006');
    const lists = q(`SELECT name, stage, position FROM lists WHERE project_id='P' ORDER BY position`).map((r) => [r.name, r.stage, r.position]);
    expect(lists).toEqual([['Backlog', 'backlog', 0], ['A fazer', 'todo', 1000], ['Fazendo', 'doing', 2000], ['Feito', 'done', 3000]]);
    const card = (id: string) => q(`SELECT * FROM cards WHERE id=?`, id)[0];
    expect(card('c1').assignee_id).toBe('u1');
    expect(card('c3').assignee_id).toBe('u1');
    expect(card('c2').completed_at).toBe(50);
    expect(card('c1').completed_at).toBeNull();
    expect(q(`SELECT user_id FROM project_members WHERE project_id='P'`).map((r) => r.user_id)).toEqual(['u1']);
    expect(q(`SELECT user_id FROM sprints WHERE id='S'`)[0].user_id).toBe('u1');
    expect(q(`SELECT type, actor_id FROM card_events WHERE card_id='c1'`)).toEqual([{ type: 'migrated', actor_id: null }]);
  });

  it('0006 mantém cada card na mesma lista, com mesmo título e posição (sem cascade)', () => {
    seedBase();
    const before = q(`SELECT id, list_id, title, position FROM cards ORDER BY id`);
    migrateTo(sqlite, '0006');
    expect(q(`SELECT id, list_id, title, position FROM cards ORDER BY id`)).toEqual(before);
    expect(before).toHaveLength(3);
  });

  it('0006 aborta sem alterar nada quando um projeto tem lista fora das três etapas', () => {
    seedBase('Revisão');
    const snap = () => ({
      lists: q(`SELECT * FROM lists ORDER BY id`),
      cards: q(`SELECT * FROM cards ORDER BY id`),
      projects: q(`SELECT * FROM projects`),
      sprints: q(`SELECT * FROM sprints`),
    });
    const before = snap();
    expect(() => migrateTo(sqlite, '0006')).toThrow();
    expect(snap()).toEqual(before);
    expect(q(`SELECT name FROM lists WHERE name='Backlog'`)).toEqual([]);
    expect(q(`SELECT name FROM sqlite_master WHERE name IN ('project_members','card_events','_stage_guard')`)).toEqual([]);
    expect(q(`PRAGMA table_info(lists)`).some((c) => c.name === 'stage')).toBe(false);
  });
});
