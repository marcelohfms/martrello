// lib/core/assignee.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { makeTestDb, makeUser, addMemberRow, type Db } from './test-helpers';
import { createProject } from './projects';
import { resolveAssignee } from './assignee';
import { SYSTEM_ACTOR } from '@/lib/access/actor';

let db: Db;
let close: () => void;
let projectId: string;
beforeEach(async () => {
  const t = makeTestDb();
  db = t.db;
  close = t.close;
  projectId = (await createProject(db, SYSTEM_ACTOR, { name: 'p' })).id;
});
afterEach(() => close());

describe('resolveAssignee', () => {
  it('aceita id, e-mail (sem diferenciar caixa) ou nome de membro ativo', async () => {
    const m = await makeUser(db, { name: 'Ana', email: 'ana@x.com' });
    addMemberRow(db, projectId, m.user.id);
    expect((await resolveAssignee(db, projectId, m.user.id)).id).toBe(m.user.id);
    expect((await resolveAssignee(db, projectId, ' ANA@x.com ')).id).toBe(m.user.id);
    expect((await resolveAssignee(db, projectId, 'Ana')).id).toBe(m.user.id);
  });

  it('nome repetido entre membros ativos lança INVALID_INPUT', async () => {
    const a = await makeUser(db, { name: 'Ana', email: 'ana1@x.com' });
    const b = await makeUser(db, { name: 'Ana', email: 'ana2@x.com' });
    addMemberRow(db, projectId, a.user.id);
    addMemberRow(db, projectId, b.user.id);
    await expect(resolveAssignee(db, projectId, 'Ana')).rejects.toMatchObject({
      code: 'INVALID_INPUT',
      originalMessage: "Mais de um membro com o nome 'Ana'. Use o e-mail.",
    });
    expect((await resolveAssignee(db, projectId, 'ana2@x.com')).id).toBe(b.user.id);
  });

  it('nome repetido com um só membro do projeto resolve para ele', async () => {
    const a = await makeUser(db, { name: 'Ana', email: 'ana1@x.com' });
    await makeUser(db, { name: 'Ana', email: 'ana2@x.com' }); // não é membro
    addMemberRow(db, projectId, a.user.id);
    expect((await resolveAssignee(db, projectId, 'Ana')).id).toBe(a.user.id);
  });
});
