import { describe, it, expect, beforeEach, vi } from 'vitest';
import { makeTestDb, makeUser, addMemberRow, type Db } from '@/lib/core/test-helpers';
import * as clientModule from '@/lib/db/client';
import { listCardEvents } from '@/lib/core/events';
import { SYSTEM_ACTOR } from '@/lib/access/actor';
import { cardTools } from './cards';
import { projectTools } from './projects';
import type { ToolCtx } from './index';

let db: Db;
let ctx: ToolCtx;
beforeEach(async () => {
  const t = makeTestDb();
  db = t.db;
  vi.spyOn(clientModule, 'getDb').mockReturnValue(db as any);
  ctx = { actor: (await makeUser(db, { role: 'admin' })).actor };
});

const find = (name: string) =>
  [...projectTools, ...cardTools].find((t) => t.definition.name === name)!;

describe('card tools', () => {
  it('creates and moves a card', async () => {
    await find('martrello_create_project').handler({ name: 'p' }, ctx);
    const c: any = await find('martrello_create_card').handler({ project: 'p', title: 'hi' }, ctx);
    expect(c.title).toBe('hi');
    await find('martrello_update_card').handler({ id: c.id, title: 'bye' }, ctx);
    await find('martrello_move_card').handler({ id: c.id, to_list: 'Fazendo' }, ctx);
    const got: any = await find('martrello_get_card').handler({ id: c.id }, ctx);
    expect(got.title).toBe('bye');
    expect(got.assigneeId).toBe((ctx.actor as { id: string }).id);
  });

  it('archive_card succeeds', async () => {
    await find('martrello_create_project').handler({ name: 'p' }, ctx);
    const c: any = await find('martrello_create_card').handler({ project: 'p', title: 'x' }, ctx);
    await find('martrello_archive_card').handler({ id: c.id }, ctx);
  });

  it('create_card fora do Backlog fica com quem chama e registra o autor', async () => {
    const p: any = await find('martrello_create_project').handler({ name: 'p' }, ctx);
    const m = await makeUser(db, { name: 'Caio' });
    addMemberRow(db, p.id, m.user.id);
    const c: any = await find('martrello_create_card').handler({ project: 'p', list: 'A fazer', title: 'x' }, { actor: m.actor });
    expect(c.assigneeId).toBe(m.user.id);
    const events = await listCardEvents(db, m.actor, c.id);
    expect(events.every((e) => e.actorName === 'Caio')).toBe(true);
  });

  it('create_card não aceita mais add_to_sprint', () => {
    const props = find('martrello_create_card').definition.inputSchema.properties ?? {};
    expect(props).not.toHaveProperty('add_to_sprint');
  });

  it('move_card como sistema sem responsável lança ASSIGNEE_REQUIRED', async () => {
    await find('martrello_create_project').handler({ name: 'p' }, ctx);
    const c: any = await find('martrello_create_card').handler({ project: 'p', title: 'x' }, ctx);
    await expect(find('martrello_move_card').handler({ id: c.id, to_list: 'todo' }, { actor: SYSTEM_ACTOR }))
      .rejects.toMatchObject({ code: 'ASSIGNEE_REQUIRED' });
  });

  it('assign_card atribui e get_card_history mostra o autor', async () => {
    const p: any = await find('martrello_create_project').handler({ name: 'p' }, ctx);
    const m = await makeUser(db, { name: 'Caio', email: 'caio@x.com' });
    addMemberRow(db, p.id, m.user.id);
    const c: any = await find('martrello_create_card').handler({ project: 'p', title: 'x' }, ctx);
    const out: any = await find('martrello_assign_card').handler({ id: c.id, assignee: 'caio@x.com' }, ctx);
    expect(out.assigneeId).toBe(m.user.id);
    const hist: any[] = (await find('martrello_get_card_history').handler({ id: c.id }, ctx)) as any;
    expect(hist.length).toBeGreaterThan(0);
    expect(hist.some((e) => e.type === 'assignee')).toBe(true);
    const un: any = await find('martrello_assign_card').handler({ id: c.id, assignee: null }, ctx);
    expect(un.assigneeId).toBeNull();
  });

  it('create_card aceita assignee', async () => {
    const p: any = await find('martrello_create_project').handler({ name: 'p' }, ctx);
    const m = await makeUser(db, { name: 'Caio', email: 'caio@x.com' });
    addMemberRow(db, p.id, m.user.id);
    const c: any = await find('martrello_create_card').handler({ project: 'p', list: 'A fazer', title: 'x', assignee: 'caio@x.com' }, ctx);
    expect(c.assigneeId).toBe(m.user.id);
  });

  it('descrições citam a regra do responsável', () => {
    for (const n of ['martrello_create_card', 'martrello_assign_card']) {
      expect(find(n).definition.description).toContain('Fora do Backlog precisa de responsável. Sem `assignee`, fica com quem chama.');
    }
  });
});
