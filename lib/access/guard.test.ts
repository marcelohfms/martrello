import { describe, it, expect, afterEach, vi } from 'vitest';
import { makeTestDb, makeUser, addMemberRow, type Db } from '@/lib/core/test-helpers';
import { projects, lists, cards } from '@/lib/db/schema';
import { SYSTEM_ACTOR, actorUserId, toActor } from './actor';
import {
  seesAllProjects,
  visibleProjectIds,
  loadVisibleCard,
  assertAdmin,
} from './guard';

const getCurrentUserMock = vi.hoisted(() => vi.fn());
vi.mock('@/lib/auth/sessions', () => ({ validateSession: getCurrentUserMock }));
vi.mock('@/lib/db/client', () => ({ getDb: () => ({}) }));

const redirectMock = vi.hoisted(() =>
  vi.fn((to: string) => {
    throw new Error(`REDIRECT:${to}`);
  }),
);
vi.mock('next/navigation', () => ({ redirect: redirectMock }));
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => ({ value: 'tok' }) }) }));

let close: (() => void) | undefined;
afterEach(() => {
  close?.();
  close = undefined;
  vi.clearAllMocks();
});

function setup() {
  const t = makeTestDb();
  close = t.close;
  return t.db;
}

function seed(db: Db, id: string) {
  db.insert(projects).values({ id, name: id, acronym: id.toUpperCase(), color: '#000', position: 1, createdAt: 1 }).run();
  db.insert(lists).values({ id: `l-${id}`, projectId: id, name: 'Backlog', stage: 'backlog', position: 1, createdAt: 1 }).run();
  db.insert(cards).values({ id: `c-${id}`, projectId: id, listId: `l-${id}`, title: 't', position: 1, createdAt: 1, updatedAt: 1 }).run();
}

describe('access guard', () => {
  it('membro só vê projetos de que é membro', async () => {
    const db = setup();
    seed(db, 'p1');
    seed(db, 'p2');
    const { user, actor } = await makeUser(db);
    addMemberRow(db, 'p1', user.id);
    expect(await visibleProjectIds(db, actor)).toEqual(['p1']);
  });

  it('admin e sistema veem tudo', async () => {
    const db = setup();
    seed(db, 'p1');
    const { actor: admin } = await makeUser(db, { role: 'admin' });
    expect(await visibleProjectIds(db, admin)).toBeNull();
    expect(await visibleProjectIds(db, SYSTEM_ACTOR)).toBeNull();
    expect(seesAllProjects(admin)).toBe(true);
    expect(seesAllProjects(SYSTEM_ACTOR)).toBe(true);
    expect((await loadVisibleCard(db, SYSTEM_ACTOR, 'c-p1')).id).toBe('c-p1');
  });

  it('loadVisibleCard de projeto alheio lança CARD_NOT_FOUND', async () => {
    const db = setup();
    seed(db, 'p1');
    seed(db, 'p2');
    const { user, actor } = await makeUser(db);
    addMemberRow(db, 'p1', user.id);
    expect((await loadVisibleCard(db, actor, 'c-p1')).id).toBe('c-p1');
    await expect(loadVisibleCard(db, actor, 'c-p2')).rejects.toMatchObject({ code: 'CARD_NOT_FOUND' });
    await expect(loadVisibleCard(db, actor, 'nope')).rejects.toMatchObject({ code: 'CARD_NOT_FOUND' });
  });

  it('assertAdmin com membro lança FORBIDDEN', async () => {
    const db = setup();
    const { actor: member } = await makeUser(db);
    const { actor: admin } = await makeUser(db, { role: 'admin' });
    expect(() => assertAdmin(member)).toThrowError(/Só o admin pode fazer isso\./);
    expect(() => assertAdmin(member)).toThrowError(expect.objectContaining({ code: 'FORBIDDEN' }));
    expect(() => assertAdmin(admin)).not.toThrow();
    expect(() => assertAdmin(SYSTEM_ACTOR)).not.toThrow();
  });

  it('helpers de ator', async () => {
    const db = setup();
    const { user, actor } = await makeUser(db);
    expect(actorUserId(actor)).toBe(user.id);
    expect(actorUserId(SYSTEM_ACTOR)).toBeNull();
    expect(toActor({ id: 'u', email: 'e', name: 'n', role: 'admin' })).toEqual({ kind: 'user', id: 'u', role: 'admin' });
  });

  it('requireAdmin redireciona membro para /', async () => {
    const db = setup();
    const { user } = await makeUser(db);
    getCurrentUserMock.mockResolvedValue({ id: user.id, email: user.email, name: user.name, role: 'member' });
    const { requireAdmin, requireActor } = await import('@/lib/auth/current-user');
    await expect(requireAdmin()).rejects.toThrow('REDIRECT:/');
    expect((await requireActor()).actor).toEqual({ kind: 'user', id: user.id, role: 'member' });

    getCurrentUserMock.mockResolvedValue({ id: 'a', email: 'a@x', name: 'A', role: 'admin' });
    expect((await requireAdmin()).actor.kind).toBe('user');

    getCurrentUserMock.mockResolvedValue(null);
    await expect(requireActor()).rejects.toThrow('REDIRECT:/login');
  });
});
