// lib/core/sprint.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { and, eq, isNull } from 'drizzle-orm';
import { makeTestDb, makeUser, addMemberRow, type Db } from './test-helpers';
import type { Actor } from '@/lib/access/actor';
import { cards, projectMembers, sprints, users } from '@/lib/db/schema';
import { createProject, archiveProject } from './projects';
import { createCard, getCardById, updateCard, archiveCard } from './cards';
import { addDependency } from './dependencies';
import {
  ensureCurrentSprint, getMySprint, rolloverAllSprints, listSprints, getSprintHistory,
} from './sprint';

let db: Db;
let admin: Actor;
let adminId: string;
let member: Actor;
let memberId: string;
let p: { id: string };

// A Wednesday afternoon in São Paulo; the week starts on 2026-11-16.
const WED = new Date('2026-11-18T15:00:00Z');
const PREV_WED = new Date('2026-11-11T15:00:00Z');

beforeEach(async () => {
  db = makeTestDb().db;
  const a = await makeUser(db, { role: 'admin' });
  admin = a.actor;
  adminId = a.user.id;
  const m = await makeUser(db);
  member = m.actor;
  memberId = m.user.id;
  p = await createProject(db, admin, { name: 'Nubank' });
  addMemberRow(db, p.id, memberId);
});

async function card(list: 'backlog' | 'todo' | 'doing' | 'done', assignee: string, extra: { title?: string; project?: string } = {}) {
  return createCard(db, admin, {
    project: extra.project ?? p.id, list, title: extra.title ?? `t-${list}`, assignee,
  });
}

function setCompletedAt(id: string, at: number) {
  db.update(cards).set({ completedAt: at }).where(eq(cards.id, id)).run();
}

function sprintsOf(userId: string) {
  return db.select().from(sprints).where(eq(sprints.userId, userId)).all();
}

describe('getMySprint', () => {
  it('tarefa em A fazer do ator aparece na sprint dele e não na de outro', async () => {
    const mine = await card('todo', memberId, { title: 'minha' });
    const other = await card('todo', adminId, { title: 'do admin' });
    await card('backlog', memberId, { title: 'no backlog' });

    const s = await getMySprint(db, member, WED);
    expect(s.cards.map((c) => [c.id, c.stage])).toEqual([[mine.id, 'todo']]);
    expect(s.userId).toBe(memberId);
    expect(s.name).toBe('Semana 16/11');

    const a = await getMySprint(db, admin, WED);
    expect(a.cards.map((c) => c.id)).toEqual([other.id]);
  });

  it('Feito só mostra o concluído na semana', async () => {
    const doing = await card('doing', memberId, { title: 'fazendo' });
    const thisWeek = await card('done', memberId, { title: 'feita nesta semana' });
    const lastWeek = await card('done', memberId, { title: 'feita na anterior' });
    setCompletedAt(thisWeek.id, Date.parse('2026-11-16T03:00:00Z')); // segunda 00:00 em SP
    setCompletedAt(lastWeek.id, Date.parse('2026-11-16T02:59:00Z')); // domingo 23:59 em SP

    const s = await getMySprint(db, member, WED);
    expect(s.cards.map((c) => [c.id, c.stage])).toEqual([[doing.id, 'doing'], [thisWeek.id, 'done']]);
    expect(s.cards[1].completedAt).toBe(Date.parse('2026-11-16T03:00:00Z'));
  });

  it('deixa de fora cards arquivados e de projetos arquivados', async () => {
    const kept = await card('todo', memberId, { title: 'fica' });
    const archived = await card('todo', memberId, { title: 'arquivada' });
    await archiveCard(db, admin, archived.id);
    const p2 = await createProject(db, admin, { name: 'Velho' });
    addMemberRow(db, p2.id, memberId);
    await card('doing', memberId, { project: p2.id, title: 'de projeto arquivado' });
    await archiveProject(db, admin, p2.id);

    const s = await getMySprint(db, member, WED);
    expect(s.cards.map((c) => c.id)).toEqual([kept.id]);
  });

  it('ordena cada etapa por prazo mais próximo e mantém a ordem das etapas', async () => {
    const doing = await card('doing', memberId, { title: 'fazendo' });
    const late = await card('todo', memberId, { title: 'tarde' });
    const undated = await card('todo', memberId, { title: 'sem prazo' });
    const soon = await card('todo', memberId, { title: 'cedo' });
    await updateCard(db, admin, late.id, { dueDate: '2026-11-24' });
    await updateCard(db, admin, soon.id, { dueDate: '2026-11-11' });
    await updateCard(db, admin, doing.id, { dueDate: '2026-11-01' });

    const s = await getMySprint(db, member, WED);
    expect(s.cards.map((c) => c.id)).toEqual([soon.id, late.id, undated.id, doing.id]);
  });

  it('cards trazem projeto, sigla e bloqueio', async () => {
    const blocker = await card('todo', memberId, { title: 'antes' });
    const blocked = await card('todo', memberId, { title: 'depois' });
    await addDependency(db, admin, blocked.id, blocker.id);

    const s = await getMySprint(db, member, WED);
    const c = s.cards.find((x) => x.id === blocked.id)!;
    expect(c).toMatchObject({ projectId: p.id, projectName: 'Nubank', projectAcronym: 'NBK', isBlocked: true, completedAt: null });
    expect(s.cards.find((x) => x.id === blocker.id)!.isBlocked).toBe(false);
  });
});

describe('ensureCurrentSprint', () => {
  it('ensureCurrentSprint chamado 3 vezes na mesma semana deixa 1 sprint aberta', async () => {
    const a = await ensureCurrentSprint(db, memberId, WED);
    const b = await ensureCurrentSprint(db, memberId, new Date('2026-11-16T03:00:00Z'));
    const c = await ensureCurrentSprint(db, memberId, new Date('2026-11-23T02:59:00Z'));
    expect(new Set([a.id, b.id, c.id]).size).toBe(1);
    const rows = sprintsOf(memberId);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ weekStart: '2026-11-16', name: 'Semana 16/11', closedAt: null });
  });

  it('virada após dias fora do ar fecha a antiga uma vez e abre a da semana corrente', async () => {
    const old = await ensureCurrentSprint(db, memberId, new Date('2026-11-04T15:00:00Z')); // quarta, semana 02/11
    const current = await ensureCurrentSprint(db, memberId, WED); // duas semanas depois, quarta
    expect(current.weekStart).toBe('2026-11-16');
    expect(current.id).not.toBe(old.id);

    const closedAt = sprintsOf(memberId).find((s) => s.id === old.id)!.closedAt;
    expect(closedAt).not.toBeNull();

    await ensureCurrentSprint(db, memberId, new Date('2026-11-19T15:00:00Z'));
    const rows = sprintsOf(memberId);
    expect(rows).toHaveLength(2);
    expect(rows.find((s) => s.id === old.id)!.closedAt).toBe(closedAt);
    expect(rows.filter((s) => s.closedAt === null).map((s) => s.weekStart)).toEqual(['2026-11-16']);
  });

  it('o fechamento guarda snapshot e não arquiva nada', async () => {
    const todo = await card('todo', memberId, { title: 'pendente' });
    const done = await card('done', memberId, { title: 'concluída' });
    setCompletedAt(done.id, Date.parse('2026-11-10T15:00:00Z')); // semana 09/11
    const prev = await ensureCurrentSprint(db, memberId, PREV_WED);

    await ensureCurrentSprint(db, memberId, WED);

    const hist = await getSprintHistory(db, member, prev.id);
    expect(hist.closedAt).not.toBeNull();
    expect(hist.cards.map((c) => [c.id, c.stage])).toEqual([[todo.id, 'todo'], [done.id, 'done']]);
    expect((await getCardById(db, admin, done.id)).archivedAt).toBeNull();

    // A fazer segue para a sprint nova; o concluído na semana anterior sai dela.
    const s = await getMySprint(db, member, WED);
    expect(s.cards.map((c) => c.id)).toEqual([todo.id]);
  });

  it('sprint legada sem semana aberta nesta semana recebe a semana corrente', async () => {
    db.insert(sprints).values({ id: 'LEG', name: 'Sprint 7', startedAt: Date.parse('2026-11-17T12:00:00Z'), userId: memberId }).run();
    const s = await ensureCurrentSprint(db, memberId, WED);
    expect(s).toMatchObject({ id: 'LEG', weekStart: '2026-11-16', name: 'Semana 16/11', closedAt: null });
    expect(sprintsOf(memberId)).toHaveLength(1);
  });

  it('sprint legada sem semana aberta antes da semana corrente é fechada com snapshot', async () => {
    const todo = await card('todo', memberId, { title: 'pendente' });
    db.insert(sprints).values({ id: 'LEG', name: 'Sprint 7', startedAt: Date.parse('2026-11-02T12:00:00Z'), userId: memberId }).run();
    const s = await ensureCurrentSprint(db, memberId, WED);
    expect(s.id).not.toBe('LEG');
    const leg = sprintsOf(memberId).find((x) => x.id === 'LEG')!;
    expect(leg.closedAt).not.toBeNull();
    expect(JSON.parse(leg.cardsSnapshot!).map((c: { id: string }) => c.id)).toEqual([todo.id]);
  });

  it('rolloverAllSprints garante a sprint da semana para cada usuário ativo', async () => {
    const off = await makeUser(db);
    db.update(users).set({ disabledAt: 1 }).where(eq(users.id, off.user.id)).run();

    expect(await rolloverAllSprints(db, WED)).toBe(2);
    expect(await rolloverAllSprints(db, WED)).toBe(2);
    const open = db.select().from(sprints).where(isNull(sprints.closedAt)).all();
    expect(open.map((s) => s.userId).sort()).toEqual([adminId, memberId].sort());
    expect(open.every((s) => s.weekStart === '2026-11-16')).toBe(true);
  });

  it('a falha de um usuário na virada não impede os outros', async () => {
    // A corrupt open sprint makes this user's rollover throw (invalid week date).
    db.insert(sprints).values({ id: 'BAD', startedAt: 1, userId: adminId, weekStart: '1999-xx' }).run();
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      expect(await rolloverAllSprints(db, WED)).toBe(1);
      expect(err).toHaveBeenCalledWith(expect.stringMatching(new RegExp(`^\\[sprint\\] falha ao virar a semana de ${adminId}: `)));
    } finally {
      err.mockRestore();
    }
    expect(sprintsOf(memberId).map((s) => s.weekStart)).toEqual(['2026-11-16']);
  });

  it('se outro processo abre a sprint da semana no meio do caminho, devolve a dele', async () => {
    const stale = await ensureCurrentSprint(db, memberId, PREV_WED);
    const theirs = { id: 'THEIRS', name: 'Semana 16/11', startedAt: 1, userId: memberId, weekStart: '2026-11-16' };
    // Simulates the race: the other process commits its row, then our insert hits the UNIQUE index.
    const tx = vi.spyOn(db, 'transaction').mockImplementationOnce(() => {
      db.insert(sprints).values(theirs).run();
      throw Object.assign(new Error('UNIQUE constraint failed: sprints.user_id, sprints.week_start'), {
        code: 'SQLITE_CONSTRAINT_UNIQUE',
      });
    });
    try {
      const s = await ensureCurrentSprint(db, memberId, WED);
      expect(s.id).toBe('THEIRS');
    } finally {
      tx.mockRestore();
    }
    const rows = sprintsOf(memberId);
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.id === stale.id)!.closedAt).not.toBeNull();
  });

  it('um erro que não é de UNIQUE continua sendo lançado', async () => {
    const tx = vi.spyOn(db, 'transaction').mockImplementationOnce(() => { throw new Error('disk I/O error'); });
    try {
      await expect(ensureCurrentSprint(db, memberId, WED)).rejects.toThrow(/disk I\/O/);
    } finally {
      tx.mockRestore();
    }
  });
});

describe('histórico', () => {
  it('getSprintHistory de sprint de outro usuário lança SPRINT_NOT_FOUND', async () => {
    const theirs = await ensureCurrentSprint(db, adminId, WED);
    await expect(getSprintHistory(db, member, theirs.id)).rejects.toThrow(/SPRINT_NOT_FOUND/);
    await expect(getSprintHistory(db, member, 'nope')).rejects.toThrow(/SPRINT_NOT_FOUND/);
  });

  it('listSprints só traz as sprints do próprio ator, mais recente primeiro', async () => {
    const prev = await ensureCurrentSprint(db, memberId, PREV_WED);
    const cur = await ensureCurrentSprint(db, memberId, WED);
    await ensureCurrentSprint(db, adminId, WED);
    const rows = await listSprints(db, member, {});
    expect(rows.map((s) => s.id)).toEqual([cur.id, prev.id]);
    for (const r of rows) expect(r).not.toHaveProperty('cardsSnapshot');
    expect(await listSprints(db, member, { limit: 1 })).toHaveLength(1);
  });

  it('o histórico esconde cards de projetos que o ator não vê mais', async () => {
    const kept = await card('todo', memberId, { title: 'fica' });
    const p2 = await createProject(db, admin, { name: 'Outro' });
    addMemberRow(db, p2.id, memberId);
    await card('todo', memberId, { project: p2.id, title: 'some' });
    const prev = await ensureCurrentSprint(db, memberId, PREV_WED);
    await ensureCurrentSprint(db, memberId, WED);

    db.delete(projectMembers).where(and(eq(projectMembers.projectId, p2.id), eq(projectMembers.userId, memberId))).run();
    const hist = await getSprintHistory(db, member, prev.id);
    expect(hist.cards.map((c) => c.id)).toEqual([kept.id]);
    expect(hist).not.toHaveProperty('cardsSnapshot');
    expect(JSON.stringify(hist)).not.toContain('Outro');
    expect(JSON.stringify(await listSprints(db, member))).not.toContain('Outro');
  });

  it('snapshot antigo com sprintList é lido com a etapa correspondente', async () => {
    const legacy = [
      { id: 'a', projectId: p.id, sprintList: 'backlog' },
      { id: 'b', projectId: p.id, sprintList: 'doing' },
      { id: 'c', projectId: p.id, sprintList: 'done' },
    ];
    db.insert(sprints).values({
      id: 'OLD', name: 'Sprint 1', startedAt: 1, closedAt: 2, userId: memberId, cardsSnapshot: JSON.stringify(legacy),
    }).run();
    const hist = await getSprintHistory(db, member, 'OLD');
    expect(hist.cards.map((c) => [c.id, c.stage, c.completedAt])).toEqual([
      ['a', 'todo', null], ['b', 'doing', null], ['c', 'done', null],
    ]);
  });
});
