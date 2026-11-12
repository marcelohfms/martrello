import { describe, it, expect, beforeEach } from 'vitest';
import { makeTestDb, makeUser, addMemberRow, type Db } from './test-helpers';
import { createProject, listProjects, getProject } from './projects';
import { createCard, searchCards, getCardById, moveCard } from './cards';
import { addDependency, removeDependency } from './dependencies';
import { listCardEvents } from './events';
import { SYSTEM_ACTOR, type Actor } from '@/lib/access/actor';
import { MartrelloError } from '@/lib/errors';

let db: Db;
let member: Actor;
let outsider: Actor;
let admin: Actor;
let p1: { id: string; name: string };
let p2: { id: string; name: string };
let cardP1: string;
let cardX: string;

beforeEach(async () => {
  db = makeTestDb().db;
  const m = await makeUser(db);
  member = m.actor;
  outsider = (await makeUser(db)).actor;
  admin = (await makeUser(db, { role: 'admin' })).actor;
  p1 = await createProject(db, admin, { name: 'Publico' });
  p2 = await createProject(db, admin, { name: 'Segredo' });
  addMemberRow(db, p1.id, m.user.id);
  cardP1 = (await createCard(db, SYSTEM_ACTOR, { project: p1.id, title: 'visivel' })).id;
  cardX = (await createCard(db, SYSTEM_ACTOR, { project: p2.id, title: 'visivel secreto' })).id;
});

async function rejection(p: Promise<unknown>): Promise<MartrelloError> {
  try {
    await p;
  } catch (e) {
    return e as MartrelloError;
  }
  throw new Error('expected rejection');
}

describe('visibility of reads', () => {
  it('listProjects do membro não inclui P2', async () => {
    expect((await listProjects(db, member)).map((p) => p.id)).toEqual([p1.id]);
    expect(await listProjects(db, outsider)).toEqual([]);
    expect(await listProjects(db, SYSTEM_ACTOR)).toHaveLength(2);
  });

  it('getProject(P2) lança PROJECT_NOT_FOUND sem sugerir o nome de P2', async () => {
    for (const ref of ['Segredo', 'Segreto', p2.id]) {
      const err = await rejection(getProject(db, member, ref));
      expect(err.code).toBe('PROJECT_NOT_FOUND');
      expect(err.suggestions ?? []).not.toContain('Segredo');
      expect(err.suggestions ?? []).toEqual([]);
    }
  });

  it('searchCards não retorna X, com ou sem filtro de projeto', async () => {
    expect((await searchCards(db, member, { query: 'visivel' })).map((c) => c.id)).toEqual([cardP1]);
    const err = await rejection(searchCards(db, member, { query: '', project: p2.id }));
    expect(err.code).toBe('PROJECT_NOT_FOUND');
  });

  it('getCardById(X) lança CARD_NOT_FOUND', async () => {
    expect((await rejection(getCardById(db, member, cardX))).code).toBe('CARD_NOT_FOUND');
  });

  it('listCardEvents(X) lança CARD_NOT_FOUND', async () => {
    expect((await rejection(listCardEvents(db, member, cardX))).code).toBe('CARD_NOT_FOUND');
  });

  it('addDependency de card de P1 com bloqueador X lança CARD_NOT_FOUND', async () => {
    expect((await rejection(addDependency(db, member, cardP1, cardX))).code).toBe('CARD_NOT_FOUND');
  });

  it('outsider em add/removeDependency com X como bloqueado lança CARD_NOT_FOUND', async () => {
    expect((await rejection(addDependency(db, outsider, cardX, cardP1))).code).toBe('CARD_NOT_FOUND');
    expect((await rejection(removeDependency(db, outsider, cardX, cardP1))).code).toBe('CARD_NOT_FOUND');
    expect((await rejection(addDependency(db, outsider, cardP1, cardX))).code).toBe('CARD_NOT_FOUND');
  });

  it('moveCard para P2 é indistinguível de projeto inexistente', async () => {
    const hidden = await rejection(moveCard(db, member, cardP1, { toProject: 'Segredo', toList: 'backlog' }));
    const missing = await rejection(moveCard(db, member, cardP1, { toProject: 'Inexistente', toList: 'backlog' }));
    expect(hidden.code).toBe('PROJECT_NOT_FOUND');
    expect(hidden.suggestions ?? []).toEqual([]);
    expect(hidden.message).toBe(missing.message.replace('Inexistente', 'Segredo'));
    const byId = await rejection(moveCard(db, member, cardP1, { toProject: p2.id, toList: 'backlog' }));
    expect(byId.code).toBe('PROJECT_NOT_FOUND');
  });

  it('createCard em P2 não vaza nome nem sugestões', async () => {
    const err = await rejection(createCard(db, member, { project: 'Segreto', title: 't' }));
    expect(err.code).toBe('PROJECT_NOT_FOUND');
    expect(err.suggestions ?? []).toEqual([]);
    expect(err.message).not.toContain(p2.id);
  });

  it('moveCard entre projetos remove dependências nos dois sentidos e registra eventos', async () => {
    const blocker = (await createCard(db, SYSTEM_ACTOR, { project: p1.id, title: 'blocker' })).id;
    const dependent = (await createCard(db, SYSTEM_ACTOR, { project: p1.id, title: 'dependent' })).id;
    await addDependency(db, admin, cardP1, blocker); // cardP1 blocked by blocker
    await addDependency(db, admin, dependent, cardP1); // dependent blocked by cardP1
    await moveCard(db, admin, cardP1, { toProject: p2.id, toList: 'backlog' });

    const moved = await getCardById(db, admin, cardP1);
    expect(moved.dependsOn).toEqual([]);
    expect((await getCardById(db, admin, dependent)).dependsOn).toEqual([]);

    const ev = async (id: string) =>
      (await listCardEvents(db, admin, id)).filter((e) => e.type === 'dependency_removed');
    expect((await ev(cardP1)).map((e) => e.from).sort()).toEqual([blocker, dependent].sort());
    expect((await ev(blocker)).map((e) => e.from)).toEqual([cardP1]);
    expect((await ev(dependent)).map((e) => e.from)).toEqual([cardP1]);
  });
});

describe('searchCards assignee filter', () => {
  it('me, e-mail, nome ambíguo, desconhecido e vazio', async () => {
    const a = await makeUser(db, { name: 'Ana', email: 'ana@x.test' });
    const b = await makeUser(db, { name: 'Dup' });
    const c = await makeUser(db, { name: 'Dup' });
    for (const u of [a, b, c]) addMemberRow(db, p1.id, u.user.id);
    const mine = await createCard(db, SYSTEM_ACTOR, { project: p1.id, title: 'da ana', assignee: 'ana@x.test' });
    await createCard(db, SYSTEM_ACTOR, { project: p1.id, title: 'do b', assignee: b.user.email });

    expect((await searchCards(db, a.actor, { query: '', assignee: 'me' })).map((x) => x.id)).toEqual([mine.id]);
    expect((await searchCards(db, member, { query: '', assignee: 'ana@x.test' })).map((x) => x.id)).toEqual([mine.id]);
    expect(await searchCards(db, member, { query: '', assignee: 'ninguem@x.test' })).toEqual([]);
    expect((await searchCards(db, member, { query: '', assignee: '   ' })).length).toBe(3);
    const amb = await rejection(searchCards(db, member, { query: '', assignee: 'Dup' }));
    expect(amb.code).toBe('INVALID_INPUT');
    expect(amb.originalMessage).toBe("Mais de um membro com o nome 'Dup'. Use o e-mail.");
    const sys = await rejection(searchCards(db, SYSTEM_ACTOR, { query: '', assignee: 'me' }));
    expect(sys.code).toBe('INVALID_INPUT');
  });
});
