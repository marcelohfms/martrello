import { describe, it, expect } from 'vitest';
import { makeTestDb, makeUser, addMemberRow } from './test-helpers';
import { SYSTEM_ACTOR } from '@/lib/access/actor';
import { createProject } from './projects';
import { createCard, moveCard, archiveCard } from './cards';
import { listDueCards } from './due-cards';

describe('listDueCards', () => {
  it('inclui Backlog sem responsável e exclui Feito, arquivada e sem prazo', async () => {
    const { db, close } = makeTestDb();
    const p = await createProject(db, SYSTEM_ACTOR, { name: 'alpha' });
    const ana = await makeUser(db, { email: 'ana@x.com', name: 'Ana' });
    addMemberRow(db, p.id, ana.user.id);

    await createCard(db, SYSTEM_ACTOR, { project: p.id, list: 'Backlog', title: 'backlog', dueDate: '2026-11-20' });
    await createCard(db, SYSTEM_ACTOR, { project: p.id, list: 'A fazer', title: 'todo', dueDate: '2026-11-18', assignee: 'ana@x.com' });
    await createCard(db, SYSTEM_ACTOR, { project: p.id, list: 'Backlog', title: 'sem prazo' });
    const arch = await createCard(db, SYSTEM_ACTOR, { project: p.id, list: 'Backlog', title: 'arquivada', dueDate: '2026-11-19' });
    await archiveCard(db, SYSTEM_ACTOR, arch.id);
    const done = await createCard(db, SYSTEM_ACTOR, { project: p.id, list: 'A fazer', title: 'feita', dueDate: '2026-11-17', assignee: 'ana@x.com' });
    await moveCard(db, SYSTEM_ACTOR, done.id, { toList: 'Feito' });

    const due = await listDueCards(db, p.id);
    expect(due.map((c) => c.title).sort()).toEqual(['backlog', 'todo']);
    const byTitle = Object.fromEntries(due.map((c) => [c.title, c]));
    expect(byTitle.backlog).toMatchObject({ dueDate: '2026-11-20', assigneeEmail: null, assigneeName: null });
    expect(byTitle.todo).toMatchObject({ dueDate: '2026-11-18', assigneeEmail: 'ana@x.com', assigneeName: 'Ana' });
    close();
  });
});
