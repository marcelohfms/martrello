import { describe, it, expect, beforeEach, vi } from 'vitest';
import { makeTestDb, makeUser, addMemberRow, type Db } from '@/lib/core/test-helpers';
import { createProject } from '@/lib/core/projects';
import { createLabel } from '@/lib/core/labels';
import { createCard } from '@/lib/core/cards';
import * as clientModule from '@/lib/db/client';
import { readTools } from './read';
import type { ToolCtx } from './index';

let db: Db;
let ctx: ToolCtx;
beforeEach(async () => {
  const t = makeTestDb();
  db = t.db;
  vi.spyOn(clientModule, 'getDb').mockReturnValue(db as any);
  ctx = { actor: (await makeUser(db, { role: 'admin' })).actor };
});

describe('read tools', () => {
  it('list_projects returns names', async () => {
    await createProject(db, ctx.actor, { name: 'a' });
    const tool = readTools.find((t) => t.definition.name === 'martrello_list_projects')!;
    const out = (await tool.handler({}, ctx)) as Array<{ name: string }>;
    expect(out.map((p) => p.name)).toContain('a');
  });

  it('list_labels returns labels', async () => {
    await createLabel(db, ctx.actor, 'urgente', '#ef4444');
    const tool = readTools.find((t) => t.definition.name === 'martrello_list_labels')!;
    const out = (await tool.handler({}, ctx)) as Array<{ name: string }>;
    expect(out.map((l) => l.name)).toEqual(['urgente']);
  });

  it('get_project errors with suggestions', async () => {
    await createProject(db, ctx.actor, { name: 'martrello' });
    const tool = readTools.find((t) => t.definition.name === 'martrello_get_project')!;
    await expect(tool.handler({ project: 'martelo' }, ctx)).rejects.toThrow(/PROJECT_NOT_FOUND/);
  });
});

describe('read tools visibility', () => {
  it('um membro só vê os projetos e cards dos seus projetos', async () => {
    const p1 = await createProject(db, ctx.actor, { name: 'aberto' });
    const p2 = await createProject(db, ctx.actor, { name: 'fechado' });
    const { user, actor } = await makeUser(db);
    addMemberRow(db, p1.id, user.id);
    await createCard(db, ctx.actor, { project: p1.id, title: 'tarefa' });
    await createCard(db, ctx.actor, { project: p2.id, title: 'tarefa oculta' });
    const mctx: ToolCtx = { actor };
    const get = (n: string) => readTools.find((t) => t.definition.name === n)!;

    const projects = (await get('martrello_list_projects').handler({}, mctx)) as Array<{ name: string }>;
    expect(projects.map((p) => p.name)).toEqual(['aberto']);
    const cards = (await get('martrello_search_cards').handler({ query: 'tarefa' }, mctx)) as Array<{ title: string }>;
    expect(cards.map((c) => c.title)).toEqual(['tarefa']);
    await expect(get('martrello_get_project').handler({ project: 'fechado' }, mctx)).rejects.toThrow(/PROJECT_NOT_FOUND/);
  });
});
