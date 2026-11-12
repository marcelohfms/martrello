import { describe, it, expect, beforeEach } from 'vitest';
import { eq } from 'drizzle-orm';
import { makeTestDb, makeUser, addMemberRow, type Db } from './test-helpers';
import { createProject } from './projects';
import { createCard, getCardById } from './cards';
import { listCardEvents } from './events';
import { listMembers, addMember, removeMember, unassignOpenCards } from './members';
import { projectMembers, users, cards } from '@/lib/db/schema';

let db: Db;
let close: () => void;
beforeEach(() => {
  const t = makeTestDb();
  db = t.db;
  close = t.close;
});

async function setup() {
  const admin = await makeUser(db, { role: 'admin', email: 'admin@t.local' });
  const bob = await makeUser(db, { email: 'bob@t.local', name: 'Bob' });
  const p = await createProject(db, admin.actor, { name: 'Proj' });
  await addMember(db, admin.actor, p.id, bob.user.id);
  return { admin, bob, p };
}

describe('members', () => {
  it('createProject adiciona o criador como membro', async () => {
    const { admin, p } = await setup();
    const rows = await db.select().from(projectMembers).where(eq(projectMembers.projectId, p.id));
    expect(rows.map((r) => r.userId)).toContain(admin.user.id);
    close();
  });

  it('addMember é idempotente e recusa conta desativada', async () => {
    const { admin, bob, p } = await setup();
    await addMember(db, admin.actor, p.id, bob.user.id);
    const rows = await db.select().from(projectMembers).where(eq(projectMembers.userId, bob.user.id));
    expect(rows).toHaveLength(1);
    const off = await makeUser(db);
    db.update(users).set({ disabledAt: 1 }).where(eq(users.id, off.user.id)).run();
    await expect(addMember(db, admin.actor, p.id, off.user.id)).rejects.toThrow(/Não dá para adicionar uma conta desativada/);
    await expect(addMember(db, admin.actor, p.id, 'nope')).rejects.toThrow(/USER_NOT_FOUND/);
    close();
  });

  it('listMembers lista só para quem vê o projeto', async () => {
    const { admin, bob, p } = await setup();
    const list = await listMembers(db, bob.actor, p.id);
    expect(list.map((m) => m.email).sort()).toEqual(['admin@t.local', 'bob@t.local']);
    expect(list[0]).toHaveProperty('disabled', false);
    const outsider = await makeUser(db);
    await expect(listMembers(db, outsider.actor, p.id)).rejects.toThrow(/PROJECT_NOT_FOUND/);
    void admin;
    close();
  });

  it('membro chamando addMember/removeMember recebe FORBIDDEN', async () => {
    const { bob, p } = await setup();
    const carol = await makeUser(db);
    await expect(addMember(db, bob.actor, p.id, carol.user.id)).rejects.toThrow(/FORBIDDEN/);
    await expect(removeMember(db, bob.actor, p.id, bob.user.id)).rejects.toThrow(/FORBIDDEN/);
    close();
  });

  it('removeMember recusa remover o admin', async () => {
    const { admin, p } = await setup();
    await expect(removeMember(db, admin.actor, p.id, admin.user.id)).rejects.toThrow(
      /Não dá para remover o admin de um projeto\./,
    );
    close();
  });

  it('removeMember devolve A fazer/Fazendo ao Backlog e tira o responsável do Backlog', async () => {
    const { admin, bob, p } = await setup();
    const todo = await createCard(db, admin.actor, { project: p.id, title: 't', list: 'todo', assignee: 'bob@t.local' });
    const doing = await createCard(db, admin.actor, { project: p.id, title: 'd', list: 'doing', assignee: 'bob@t.local' });
    const done = await createCard(db, admin.actor, { project: p.id, title: 'f', list: 'done', assignee: 'bob@t.local' });
    const back = await createCard(db, admin.actor, { project: p.id, title: 'b', assignee: 'bob@t.local' });
    const archived = await createCard(db, admin.actor, { project: p.id, title: 'a', list: 'todo', assignee: 'bob@t.local' });
    db.update(cards).set({ archivedAt: 1 }).where(eq(cards.id, archived.id)).run();

    await removeMember(db, admin.actor, p.id, bob.user.id);

    for (const c of [todo, doing]) {
      const r = await getCardById(db, admin.actor, c.id);
      expect(r.assignee).toBeNull();
      expect(r.listId).not.toBe(c.listId);
    }
    expect((await getCardById(db, admin.actor, done.id)).assignee?.email).toBe('bob@t.local');
    const backAfter = await getCardById(db, admin.actor, back.id);
    expect(backAfter.assignee).toBeNull();
    expect(backAfter.listId).toBe(back.listId);
    expect(backAfter.position).toBe(back.position);
    const backEv = await listCardEvents(db, admin.actor, back.id);
    expect(backEv.at(-1)).toMatchObject({ type: 'assignee', from: 'bob@t.local', to: null, actorName: admin.user.name });
    expect(backEv.filter((e) => e.type === 'stage')).toEqual([]);
    expect((await getCardById(db, admin.actor, archived.id)).assignee?.email).toBe('bob@t.local');
    const rows = await db.select().from(projectMembers).where(eq(projectMembers.userId, bob.user.id));
    expect(rows).toHaveLength(0);

    const ev = await listCardEvents(db, admin.actor, todo.id);
    expect(ev.find((e) => e.type === 'assignee' && e.from === 'bob@t.local')).toMatchObject({ to: null, actorName: admin.user.name });
    expect(ev.find((e) => e.type === 'stage')).toMatchObject({ from: 'A fazer', to: 'Backlog', actorName: admin.user.name });
    close();
  });

  it('unassignOpenCards acrescenta ao fim do Backlog de cada projeto e respeita projectId', async () => {
    const { admin, bob, p } = await setup();
    const p2 = await createProject(db, admin.actor, { name: 'Outro' });
    await addMember(db, admin.actor, p2.id, bob.user.id);
    const existing = await createCard(db, admin.actor, { project: p.id, title: 'x' });
    const a = await createCard(db, admin.actor, { project: p.id, title: 'a', list: 'todo', assignee: 'bob@t.local' });
    const b = await createCard(db, admin.actor, { project: p2.id, title: 'b', list: 'doing', assignee: 'bob@t.local' });
    const bl = await createCard(db, admin.actor, { project: p2.id, title: 'bl', assignee: 'bob@t.local' });

    expect(unassignOpenCards(db, admin.actor, bob.user.id, p.id)).toBe(1);
    expect((await getCardById(db, admin.actor, b.id)).assignee?.email).toBe('bob@t.local');
    expect((await getCardById(db, admin.actor, bl.id)).assignee?.email).toBe('bob@t.local');
    const moved = await getCardById(db, admin.actor, a.id);
    expect(moved.listId).toBe(existing.listId);
    expect(moved.position).toBeGreaterThan(existing.position);

    expect(unassignOpenCards(db, admin.actor, bob.user.id)).toBe(2);
    const mb = await getCardById(db, admin.actor, b.id);
    expect(mb.assignee).toBeNull();
    expect(mb.projectId).toBe(p2.id);
    const mbl = await getCardById(db, admin.actor, bl.id);
    expect(mbl.assignee).toBeNull();
    expect(mbl.listId).toBe(bl.listId);
    // The Backlog card stays where it was; the A fazer/Fazendo one goes after it.
    expect(mb.position).toBeGreaterThan(mbl.position);
    close();
  });
});
