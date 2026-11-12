import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { migrateTo } from './migrate-to';

let sqlite: Database.Database;
const q = (sql: string, ...a: unknown[]) => sqlite.prepare(sql).all(...a) as any[];
const stageOf = (id: string) =>
  q(`SELECT l.stage FROM cards c JOIN lists l ON l.id = c.list_id WHERE c.id = ?`, id)[0].stage;
const assignee = (id: string) => q(`SELECT assignee_id FROM cards WHERE id = ?`, id)[0].assignee_id;
const tableExists = (name: string) =>
  q(`SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?`, name).length > 0;

// A database at 0006: u1 owns the open sprint S (with c1) and a closed sprint S0 (with c4).
function seed() {
  sqlite.exec(`
    INSERT INTO users (id, email, name, password_hash, role, created_at) VALUES ('u1','marcelo.ferro@axivero.com.br','Marcelo','H','admin',1);
    INSERT INTO projects (id, name, acronym, color, position, created_at) VALUES ('P','P','P','#000',1000,1),('Q','Q','Q','#000',2000,1);
    INSERT INTO lists (id, project_id, name, stage, position, created_at) VALUES
      ('pb','P','Backlog','backlog',0,1),('pt','P','A fazer','todo',1000,1),('pd','P','Fazendo','doing',2000,1),('pf','P','Feito','done',3000,1),
      ('qb','Q','Backlog','backlog',0,1),('qt','Q','A fazer','todo',1000,1),('qd','Q','Fazendo','doing',2000,1),('qf','Q','Feito','done',3000,1);
    INSERT INTO cards (id, project_id, list_id, title, position, created_at, updated_at, archived_at, assignee_id) VALUES
      ('c1','P','pt','na sprint',1000,1,1,NULL,'u1'),
      ('c2','P','pt','fora da sprint',2000,1,1,NULL,'u1'),
      ('c3','P','pd','fazendo',3000,1,1,NULL,'u1'),
      ('c4','Q','qt','em sprint fechada',4000,1,1,NULL,'u1'),
      ('c5','P','pt','arquivada',5000,1,1,9,'u1'),
      ('c6','Q','qf','feita',6000,1,1,NULL,'u1');
    INSERT INTO sprints (id, name, started_at, closed_at, cards_snapshot, user_id) VALUES
      ('S0','Sprint 1',1,2,'[]','u1'),('S','Sprint 2',3,NULL,NULL,'u1');
    INSERT INTO sprint_slots (card_id, sprint_id, sprint_list, position, added_at) VALUES
      ('c1','S','doing',1000,3),('c4','S0','backlog',1000,1);
  `);
}

beforeEach(() => {
  sqlite = new Database(':memory:');
  sqlite.pragma('foreign_keys = ON');
  migrateTo(sqlite, '0006');
  seed();
});

describe('migration 0007', () => {
  it('A fazer fora da sprint ativa vai para o Backlog e sprint_slots some', () => {
    migrateTo(sqlite, '0007');
    expect(stageOf('c1')).toBe('todo');
    expect(stageOf('c2')).toBe('backlog');
    expect(stageOf('c3')).toBe('doing');
    expect(stageOf('c4')).toBe('backlog');
    expect(stageOf('c5')).toBe('todo');
    expect(stageOf('c6')).toBe('done');
    expect(q(`SELECT list_id FROM cards WHERE id IN ('c2','c4') ORDER BY id`).map((r) => r.list_id)).toEqual(['pb', 'qb']);
    expect(assignee('c2')).toBe('u1');
    expect(tableExists('sprint_slots')).toBe(false);
  });

  it('registra um evento de etapa sem autor para cada card movido', () => {
    migrateTo(sqlite, '0007');
    const events = q(`SELECT card_id, type, actor_id, from_value, to_value FROM card_events ORDER BY card_id`);
    expect(events).toEqual([
      { card_id: 'c2', type: 'stage', actor_id: null, from_value: 'A fazer', to_value: 'Backlog' },
      { card_id: 'c4', type: 'stage', actor_id: null, from_value: 'A fazer', to_value: 'Backlog' },
    ]);
  });

  it('não reconstrói tabelas: cards mantêm id, título e posição, e nada mais muda de lista', () => {
    const snap = (table: string) => q(`SELECT * FROM ${table} ORDER BY id`);
    const before = {
      cards: snap('cards'), lists: snap('lists'), projects: snap('projects'), sprints: snap('sprints'), users: snap('users'),
    };
    migrateTo(sqlite, '0007');
    const moved: Record<string, string> = { c2: 'pb', c4: 'qb' };
    expect(snap('cards')).toEqual(before.cards.map((c) => (moved[c.id] ? { ...c, list_id: moved[c.id] } : c)));
    expect(snap('lists')).toEqual(before.lists);
    expect(snap('projects')).toEqual(before.projects);
    expect(snap('sprints')).toEqual(before.sprints);
    expect(snap('users')).toEqual(before.users);
  });

  it('sem sprint ativa, todo A fazer ativo vai para o Backlog', () => {
    sqlite.exec(`UPDATE sprints SET closed_at = 4 WHERE id = 'S'`);
    migrateTo(sqlite, '0007');
    expect(stageOf('c1')).toBe('backlog');
    expect(stageOf('c2')).toBe('backlog');
  });

  it('impede duas sprints do mesmo usuário na mesma semana', () => {
    migrateTo(sqlite, '0007');
    sqlite.exec(`INSERT INTO sprints (id, started_at, user_id, week_start) VALUES ('A',1,'u1','2026-11-16')`);
    expect(() => sqlite.exec(`INSERT INTO sprints (id, started_at, user_id, week_start) VALUES ('B',1,'u1','2026-11-16')`)).toThrow(/UNIQUE/);
  });
});
