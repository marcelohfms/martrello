import { describe, it, expect, beforeEach } from 'vitest';
import { eq } from 'drizzle-orm';
import { makeTestDb, makeUser, type Db } from '@/lib/core/test-helpers';
import { createProject, archiveProject } from '@/lib/core/projects';
import { createCard, getCardById } from '@/lib/core/cards';
import { addMember } from '@/lib/core/members';
import { createSession, validateSession } from './sessions';
import { listUsers, deactivateUser, reactivateUser } from './admin-users';
import { mcpTokens, projectMembers, users } from '@/lib/db/schema';

let db: Db;
let close: () => void;
beforeEach(() => {
  const t = makeTestDb();
  db = t.db;
  close = t.close;
});

describe('admin-users', () => {
  it('desativar encerra sessões, revoga tokens, desatribui e tira dos projetos', async () => {
    const admin = await makeUser(db, { role: 'admin', email: 'admin@t.local' });
    const bob = await makeUser(db, { email: 'bob@t.local' });
    const p = await createProject(db, admin.actor, { name: 'P' });
    await addMember(db, admin.actor, p.id, bob.user.id);
    const card = await createCard(db, admin.actor, { project: p.id, title: 'c', list: 'doing', assignee: 'bob@t.local' });
    const { token } = await createSession(db, bob.user.id);
    expect(await validateSession(db, token)).not.toBeNull();
    db.insert(mcpTokens).values({ id: 't1', userId: bob.user.id, tokenHash: 'h1', name: 'n', createdAt: 1 }).run();

    await deactivateUser(db, admin.actor, bob.user.id);

    expect(await validateSession(db, token)).toBeNull();
    const tok = db.select().from(mcpTokens).where(eq(mcpTokens.id, 't1')).get();
    expect(tok?.revokedAt).not.toBeNull();
    expect(db.select().from(projectMembers).where(eq(projectMembers.userId, bob.user.id)).all()).toHaveLength(0);
    expect((await getCardById(db, admin.actor, card.id)).assignee).toBeNull();
    expect(db.select().from(users).where(eq(users.id, bob.user.id)).get()?.disabledAt).not.toBeNull();
    close();
  });

  it('reativar não devolve projetos', async () => {
    const admin = await makeUser(db, { role: 'admin' });
    const bob = await makeUser(db);
    const p = await createProject(db, admin.actor, { name: 'P' });
    await addMember(db, admin.actor, p.id, bob.user.id);
    await deactivateUser(db, admin.actor, bob.user.id);
    await reactivateUser(db, admin.actor, bob.user.id);
    expect(db.select().from(users).where(eq(users.id, bob.user.id)).get()?.disabledAt).toBeNull();
    expect(db.select().from(projectMembers).where(eq(projectMembers.userId, bob.user.id)).all()).toHaveLength(0);
    close();
  });

  it('membro chamando deactivateUser/listUsers recebe FORBIDDEN', async () => {
    const bob = await makeUser(db);
    const carol = await makeUser(db);
    await expect(deactivateUser(db, bob.actor, carol.user.id)).rejects.toThrow(/FORBIDDEN/);
    await expect(reactivateUser(db, bob.actor, carol.user.id)).rejects.toThrow(/FORBIDDEN/);
    await expect(listUsers(db, bob.actor)).rejects.toThrow(/FORBIDDEN/);
    close();
  });

  it('admin não pode se desativar nem desativar outro admin', async () => {
    const a1 = await makeUser(db, { role: 'admin' });
    const a2 = await makeUser(db, { role: 'admin' });
    await expect(deactivateUser(db, a1.actor, a1.user.id)).rejects.toThrow(/FORBIDDEN/);
    await expect(deactivateUser(db, a1.actor, a2.user.id)).rejects.toThrow(/FORBIDDEN/);
    await expect(deactivateUser(db, a1.actor, 'nope')).rejects.toThrow(/USER_NOT_FOUND/);
    close();
  });

  it('listUsers conta só projetos ativos', async () => {
    const admin = await makeUser(db, { role: 'admin', email: 'admin@t.local' });
    const bob = await makeUser(db, { email: 'bob@t.local' });
    const p1 = await createProject(db, admin.actor, { name: 'P1' });
    const p2 = await createProject(db, admin.actor, { name: 'P2' });
    await addMember(db, admin.actor, p1.id, bob.user.id);
    await addMember(db, admin.actor, p2.id, bob.user.id);
    await archiveProject(db, admin.actor, p2.id);
    const rows = await listUsers(db, admin.actor);
    const b = rows.find((r) => r.email === 'bob@t.local')!;
    expect(b).toMatchObject({ id: bob.user.id, role: 'member', disabledAt: null, projectCount: 1 });
    expect(rows.find((r) => r.email === 'admin@t.local')!.projectCount).toBe(1);
    close();
  });
});
