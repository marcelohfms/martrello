// lib/core/cards.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { eq } from 'drizzle-orm';
import { makeTestDb, makeUser, addMemberRow, type Db } from './test-helpers';
import { createProject, getProjectByNameOrId, updateProject, archiveProject, reorderProjects } from './projects';
import { createLabel } from './labels';
import {
  createCard, updateCard, moveCard, assignCard, archiveCard, unarchiveCard, getCardById, searchCards,
} from './cards';
import { addDependency } from './dependencies';
import { listCardEvents } from './events';
import { getStageList } from './stages';
import { SYSTEM_ACTOR, type Actor } from '@/lib/access/actor';
import { cards, users, projectMembers } from '@/lib/db/schema';

let db: Db;
let close: () => void;
let admin: Actor;
let adminEmail: string;
beforeEach(async () => {
  const t = makeTestDb();
  db = t.db;
  close = t.close;
  const a = await makeUser(db, { role: 'admin' });
  admin = a.actor;
  adminEmail = a.user.email;
});
afterEach(() => close());

async function setup(name = 'p') {
  const p = await createProject(db, admin, { name });
  const full = await getProjectByNameOrId(db, p.id);
  return { p, lists: full.lists };
}

async function memberOf(projectId: string, opts: { name?: string; email?: string } = {}) {
  const m = await makeUser(db, opts);
  addMemberRow(db, projectId, m.user.id);
  return m;
}

describe('cards', () => {
  it('cria no Backlog sem responsável por padrão', async () => {
    const { p } = await setup();
    const backlog = await getStageList(db, p.id, 'backlog');
    const c = await createCard(db, admin, { project: p.id, title: 'hello' });
    expect(c.listId).toBe(backlog.id);
    expect(c.assigneeId).toBeNull();
    expect(c.completedAt).toBeNull();
    expect(c.title).toBe('hello');
  });

  it('criar fora do Backlog sem responsável atribui o ator', async () => {
    const { p } = await setup();
    const m = await memberOf(p.id);
    const c = await createCard(db, m.actor, { project: p.id, list: 'A fazer', title: 't' });
    expect(c.assigneeId).toBe(m.user.id);
  });

  it('sistema criando fora do Backlog sem responsável lança ASSIGNEE_REQUIRED', async () => {
    const { p } = await setup();
    await expect(createCard(db, SYSTEM_ACTOR, { project: p.id, list: 'todo', title: 't' }))
      .rejects.toThrow('A tarefa precisa de um responsável para sair do Backlog.');
    expect(await db.select().from(cards)).toHaveLength(0);
  });

  it('cria com responsável por e-mail ou nome', async () => {
    const { p } = await setup();
    const m = await memberOf(p.id, { name: 'Ana Souza', email: 'ana@x.com' });
    const byEmail = await createCard(db, admin, { project: p.id, title: 'a', assignee: 'ana@x.com' });
    const byName = await createCard(db, admin, { project: p.id, title: 'b', list: 'Fazendo', assignee: 'Ana Souza' });
    expect(byEmail.assigneeId).toBe(m.user.id);
    expect(byName.assigneeId).toBe(m.user.id);
  });

  it('criar direto em Feito grava completedAt', async () => {
    const { p } = await setup();
    const c = await createCard(db, admin, { project: p.id, list: 'Feito', title: 't' });
    expect(c.completedAt).toEqual(expect.any(Number));
  });

  it('membro não cria card em projeto de que não é membro', async () => {
    const { p } = await setup();
    const outsider = await makeUser(db);
    await expect(createCard(db, outsider.actor, { project: p.id, title: 't' })).rejects.toMatchObject({ code: 'PROJECT_NOT_FOUND' });
  });

  it('creates with description and due_date (parsed)', async () => {
    const { p } = await setup();
    const c = await createCard(db, admin, { project: p.id, title: 't', description: '# md', dueDate: '2026-06-15' });
    expect(c.description).toBe('# md');
    expect(c.dueDate).toBe('2026-06-15');
  });

  it('rejects unknown labels without leaving a card behind', async () => {
    const { p } = await setup();
    await expect(createCard(db, admin, { project: p.id, title: 't', labels: ['nope'] })).rejects.toThrow(/LABEL_NOT_FOUND/);
    expect(await db.select().from(cards)).toHaveLength(0);
  });

  it('attaches existing labels', async () => {
    const { p } = await setup();
    await createLabel(db, admin, 'bug', '#f97316');
    const c = await createCard(db, admin, { project: p.id, title: 't', labels: ['bug'] });
    const fetched = await getCardById(db, admin, c.id);
    expect(fetched.labels.map((l) => l.name)).toEqual(['bug']);
  });

  it('updates title, description, dueDate', async () => {
    const { p } = await setup();
    const c = await createCard(db, admin, { project: p.id, title: 'old' });
    const u = await updateCard(db, admin, c.id, { title: 'new', description: 'desc', dueDate: 'amanha' });
    expect(u.title).toBe('new');
    expect(u.dueDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('updateCard registra um evento por campo alterado, com valores antigo e novo', async () => {
    const { p } = await setup();
    const c = await createCard(db, admin, { project: p.id, title: 'old', dueDate: '2026-06-15' });
    await updateCard(db, admin, c.id, { title: 'new', description: 'd', dueDate: '2026-06-15' });
    const events = (await listCardEvents(db, admin, c.id)).filter((e) => e.type !== 'created');
    expect(events.map((e) => [e.type, e.from, e.to])).toEqual([
      ['title', 'old', 'new'],
      ['description', null, 'd'],
    ]);
  });

  it('moves card to another list in same project', async () => {
    const { p, lists } = await setup();
    const c = await createCard(db, admin, { project: p.id, title: 't' });
    await moveCard(db, admin, c.id, { toList: lists[1].id });
    const m = await getCardById(db, admin, c.id);
    expect(m.listId).toBe(lists[1].id);
  });

  it('mover do Backlog para A fazer sem responsável atribui o ator', async () => {
    const { p } = await setup();
    const m = await memberOf(p.id);
    const c = await createCard(db, m.actor, { project: p.id, title: 't' });
    await moveCard(db, m.actor, c.id, { toList: 'A fazer' });
    const moved = await getCardById(db, m.actor, c.id);
    expect(moved.assigneeId).toBe(m.user.id);
    expect(moved.assignee).toEqual({ id: m.user.id, name: m.user.name, email: m.user.email });
  });

  it('sistema movendo sem responsável lança ASSIGNEE_REQUIRED', async () => {
    const { p } = await setup();
    const c = await createCard(db, admin, { project: p.id, title: 't' });
    await expect(moveCard(db, SYSTEM_ACTOR, c.id, { toList: 'todo' })).rejects.toMatchObject({ code: 'ASSIGNEE_REQUIRED' });
    const after = await getCardById(db, admin, c.id);
    expect(after.listId).toBe(c.listId);
  });

  it('assignCard com não-membro lança ASSIGNEE_NOT_MEMBER', async () => {
    const { p } = await setup();
    const outsider = await makeUser(db, { email: 'fora@x.com' });
    const c = await createCard(db, admin, { project: p.id, title: 't' });
    await expect(assignCard(db, admin, c.id, 'fora@x.com')).rejects.toThrow('fora@x.com não é membro ativo deste projeto.');
    await expect(assignCard(db, admin, c.id, outsider.user.id)).rejects.toMatchObject({ code: 'ASSIGNEE_NOT_MEMBER' });
  });

  it('assignCard com membro desativado lança ASSIGNEE_NOT_MEMBER', async () => {
    const { p } = await setup();
    const m = await memberOf(p.id);
    db.update(users).set({ disabledAt: Date.now() }).where(eq(users.id, m.user.id)).run();
    const c = await createCard(db, admin, { project: p.id, title: 't' });
    await expect(assignCard(db, admin, c.id, m.user.email)).rejects.toMatchObject({ code: 'ASSIGNEE_NOT_MEMBER' });
  });

  it('assignCard troca o responsável e aceita null no Backlog', async () => {
    const { p } = await setup();
    const m = await memberOf(p.id);
    const c = await createCard(db, admin, { project: p.id, title: 't' });
    expect((await assignCard(db, admin, c.id, m.user.email)).assigneeId).toBe(m.user.id);
    expect((await assignCard(db, admin, c.id, null)).assigneeId).toBeNull();
  });

  it('assignCard(null) fora do Backlog lança ASSIGNEE_REQUIRED', async () => {
    const { p } = await setup();
    const m = await memberOf(p.id);
    const c = await createCard(db, m.actor, { project: p.id, list: 'Fazendo', title: 't' });
    await expect(assignCard(db, m.actor, c.id, null)).rejects.toMatchObject({ code: 'ASSIGNEE_REQUIRED' });
    expect((await getCardById(db, admin, c.id)).assigneeId).toBe(m.user.id);
  });

  it('entrar em Feito grava completedAt e sair limpa', async () => {
    const { p } = await setup();
    const c = await createCard(db, admin, { project: p.id, list: 'Fazendo', title: 't' });
    expect(c.completedAt).toBeNull();
    const other = await createCard(db, admin, { project: p.id, list: 'Feito', title: 'já feito' });
    await moveCard(db, admin, c.id, { toList: 'Feito', position: 1 });
    const done = await getCardById(db, admin, c.id);
    expect(done.completedAt).toEqual(expect.any(Number));
    // movimento para Feito ignora position: vai para o fim da lista
    expect(done.position).toBe(other.position + 1000);
    await moveCard(db, admin, c.id, { toList: 'Fazendo' });
    expect((await getCardById(db, admin, c.id)).completedAt).toBeNull();
  });

  it('reordenar dentro de Feito mantém completedAt', async () => {
    const { p } = await setup();
    const c = await createCard(db, admin, { project: p.id, list: 'Feito', title: 't' });
    db.update(cards).set({ completedAt: 123 }).where(eq(cards.id, c.id)).run();
    await moveCard(db, admin, c.id, { toList: 'Feito', position: 1 });
    const after = await getCardById(db, admin, c.id);
    expect(after.completedAt).toBe(123);
    const events = (await listCardEvents(db, admin, c.id)).filter((e) => e.type !== 'created' && e.type !== 'assignee');
    expect(events).toEqual([]);
  });

  it('responsável desativado em Feito: arrastar para Fazendo passa para o ator', async () => {
    const { p } = await setup();
    const m = await memberOf(p.id);
    const c = await createCard(db, admin, { project: p.id, list: 'Feito', title: 't', assignee: m.user.email });
    db.update(users).set({ disabledAt: Date.now() }).where(eq(users.id, m.user.id)).run();
    await expect(moveCard(db, SYSTEM_ACTOR, c.id, { toList: 'Fazendo' })).rejects.toMatchObject({ code: 'ASSIGNEE_REQUIRED' });
    await moveCard(db, admin, c.id, { toList: 'Fazendo' });
    const moved = await getCardById(db, admin, c.id);
    expect(moved.assignee?.email).toBe(adminEmail);
    const last = (await listCardEvents(db, admin, c.id)).at(-1)!;
    expect([last.type, last.from, last.to]).toEqual(['assignee', m.user.email, adminEmail]);
  });

  it('responsável inelegível é mantido ao ir para Backlog ou Feito no mesmo projeto', async () => {
    const { p } = await setup();
    const m = await memberOf(p.id);
    const c = await createCard(db, admin, { project: p.id, list: 'Feito', title: 't', assignee: m.user.email });
    db.update(users).set({ disabledAt: Date.now() }).where(eq(users.id, m.user.id)).run();
    await moveCard(db, admin, c.id, { toList: 'Backlog' });
    expect((await getCardById(db, admin, c.id)).assigneeId).toBe(m.user.id);
    await moveCard(db, SYSTEM_ACTOR, c.id, { toList: 'Feito' });
    expect((await getCardById(db, admin, c.id)).assigneeId).toBe(m.user.id);
  });

  it('desarquivar card em A fazer com membro removido passa para o admin', async () => {
    const { p } = await setup();
    const m = await memberOf(p.id);
    const c = await createCard(db, admin, { project: p.id, list: 'A fazer', title: 't', assignee: m.user.email });
    await archiveCard(db, admin, c.id);
    db.delete(projectMembers).where(eq(projectMembers.userId, m.user.id)).run();
    await expect(unarchiveCard(db, SYSTEM_ACTOR, c.id)).rejects.toMatchObject({ code: 'ASSIGNEE_REQUIRED' });
    expect((await getCardById(db, admin, c.id)).archivedAt).not.toBeNull();
    await unarchiveCard(db, admin, c.id);
    const after = await getCardById(db, admin, c.id);
    expect(after.archivedAt).toBeNull();
    expect(after.assignee?.email).toBe(adminEmail);
    const tail = (await listCardEvents(db, admin, c.id)).slice(-2);
    expect(tail.map((e) => [e.type, e.from, e.to])).toEqual([
      ['unarchived', null, null],
      ['assignee', m.user.email, adminEmail],
    ]);
  });

  it('mover para A fazer de outro projeto com responsável não membro passa para o ator', async () => {
    const { p: p1 } = await setup('p1');
    const { p: p2 } = await setup('p2');
    const m = await memberOf(p1.id);
    const c = await createCard(db, admin, { project: p1.id, list: 'Fazendo', title: 't', assignee: m.user.email });
    await expect(moveCard(db, SYSTEM_ACTOR, c.id, { toProject: p2.id, toList: 'A fazer' }))
      .rejects.toMatchObject({ code: 'ASSIGNEE_REQUIRED' });
    await moveCard(db, admin, c.id, { toProject: p2.id, toList: 'A fazer' });
    const moved = await getCardById(db, admin, c.id);
    expect(moved.projectId).toBe(p2.id);
    expect(moved.assignee?.email).toBe(adminEmail);
  });

  it('rejects moving to a list in a different project', async () => {
    const { p } = await setup();
    const other = await createProject(db, admin, { name: 'other' });
    const otherFull = await getProjectByNameOrId(db, other.id);
    const c = await createCard(db, admin, { project: p.id, title: 't' });
    await expect(moveCard(db, admin, c.id, { toList: otherFull.lists[0].id })).rejects.toThrow(/LIST_NOT_IN_PROJECT/);
  });

  it('moves card across projects via toProject + toList', async () => {
    const { p } = await setup();
    const other = await createProject(db, admin, { name: 'other' });
    const otherFull = await getProjectByNameOrId(db, other.id);
    const c = await createCard(db, admin, { project: p.id, title: 't' });
    await moveCard(db, admin, c.id, { toProject: other.id, toList: otherFull.lists[0].id });
    const m = await getCardById(db, admin, c.id);
    expect(m.projectId).toBe(other.id);
    expect(m.listId).toBe(otherFull.lists[0].id);
  });

  it('mover para outro projeto exige responsável membro do destino', async () => {
    const { p: p1 } = await setup('p1');
    const { p: p2 } = await setup('p2');
    const m = await memberOf(p1.id);
    const c = await createCard(db, admin, { project: p1.id, title: 't', assignee: m.user.email });
    await expect(moveCard(db, admin, c.id, { toProject: p2.id, toList: 'Backlog' }))
      .rejects.toMatchObject({ code: 'ASSIGNEE_NOT_MEMBER' });
    expect((await getCardById(db, admin, c.id)).projectId).toBe(p1.id);

    addMemberRow(db, p2.id, m.user.id);
    await moveCard(db, admin, c.id, { toProject: p2.id, toList: 'Backlog' });
    expect((await getCardById(db, admin, c.id)).projectId).toBe(p2.id);
  });

  it('membro não move card para projeto que não vê', async () => {
    const { p: p1 } = await setup('p1');
    const { p: p2 } = await setup('p2');
    const m = await memberOf(p1.id);
    const c = await createCard(db, m.actor, { project: p1.id, title: 't' });
    await expect(moveCard(db, m.actor, c.id, { toProject: p2.id, toList: 'Backlog' }))
      .rejects.toMatchObject({ code: 'PROJECT_NOT_FOUND' });
  });

  it('membro não mexe em card de projeto alheio', async () => {
    const { p } = await setup();
    const outsider = await makeUser(db);
    const c = await createCard(db, admin, { project: p.id, title: 't' });
    await expect(updateCard(db, outsider.actor, c.id, { title: 'x' })).rejects.toMatchObject({ code: 'CARD_NOT_FOUND' });
    await expect(moveCard(db, outsider.actor, c.id, { toList: 'todo' })).rejects.toMatchObject({ code: 'CARD_NOT_FOUND' });
    await expect(archiveCard(db, outsider.actor, c.id)).rejects.toMatchObject({ code: 'CARD_NOT_FOUND' });
    await expect(getCardById(db, outsider.actor, c.id)).rejects.toMatchObject({ code: 'CARD_NOT_FOUND' });
  });

  it('registra eventos created, stage e assignee com autor', async () => {
    const { p } = await setup();
    const m = await memberOf(p.id, { name: 'Bia' });
    const c = await createCard(db, m.actor, { project: p.id, title: 't' });
    await moveCard(db, m.actor, c.id, { toList: 'A fazer' });
    const events = await listCardEvents(db, admin, c.id);
    expect(events.map((e) => [e.type, e.from, e.to, e.actorName])).toEqual([
      ['created', null, 'Backlog', 'Bia'],
      ['stage', 'Backlog', 'A fazer', 'Bia'],
      ['assignee', null, m.user.email, 'Bia'],
    ]);
  });

  it('registra evento de projeto ao mover entre projetos', async () => {
    const { p: p1 } = await setup('p1');
    const { p: p2 } = await setup('p2');
    const c = await createCard(db, admin, { project: p1.id, title: 't' });
    await moveCard(db, admin, c.id, { toProject: p2.id, toList: 'Backlog' });
    const events = (await listCardEvents(db, admin, c.id)).filter((e) => e.type !== 'created');
    expect(events.map((e) => [e.type, e.from, e.to])).toEqual([['project', p1.id, p2.id]]);
  });

  it('registra troca de responsável e arquivamento', async () => {
    const { p } = await setup();
    const m = await memberOf(p.id);
    const c = await createCard(db, admin, { project: p.id, title: 't' });
    await assignCard(db, admin, c.id, m.user.email);
    await archiveCard(db, admin, c.id);
    await unarchiveCard(db, admin, c.id);
    const events = (await listCardEvents(db, admin, c.id)).filter((e) => e.type !== 'created');
    expect(events.map((e) => [e.type, e.from, e.to])).toEqual([
      ['assignee', null, m.user.email],
      ['archived', null, null],
      ['unarchived', null, null],
    ]);
  });

  it('unarchive clears archivedAt', async () => {
    const { p } = await setup();
    const c = await createCard(db, admin, { project: p.id, title: 't' });
    await archiveCard(db, admin, c.id);
    await unarchiveCard(db, admin, c.id);
    const m = await getCardById(db, admin, c.id);
    expect(m.archivedAt).toBeNull();
  });

  it('searches cards by title substring', async () => {
    const { p } = await setup();
    await createCard(db, admin, { project: p.id, title: 'revisar PR #123' });
    await createCard(db, admin, { project: p.id, title: 'criar landing' });
    const out = await searchCards(db, admin, { query: 'revisar' });
    expect(out.map((c) => c.title)).toEqual(['revisar PR #123']);
  });

  it('getCardById reports isBlocked and dependsOn', async () => {
    const { p } = await setup();
    const a = await createCard(db, admin, { project: p.id, title: 'a' });
    const b = await createCard(db, admin, { project: p.id, title: 'b' });
    await addDependency(db, admin, b.id, a.id);
    const card = await getCardById(db, admin, b.id);
    expect(card.isBlocked).toBe(true);
    expect(card.dependsOn).toEqual([{ id: a.id, title: 'a', isDone: false }]);
    expect(card.assignee).toBeNull();
  });
});

describe('projetos exigem admin', () => {
  it('membro não cria projeto (FORBIDDEN)', async () => {
    const { actor: member } = await makeUser(db);
    await expect(createProject(db, member, { name: 'x' })).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('membro não atualiza, arquiva nem reordena projetos (FORBIDDEN)', async () => {
    const { p } = await setup();
    const m = await memberOf(p.id);
    await expect(updateProject(db, m.actor, p.id, { name: 'y' })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(archiveProject(db, m.actor, p.id)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(reorderProjects(db, m.actor, [p.id])).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});
