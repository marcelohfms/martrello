import { describe, it, expect, beforeEach, vi } from 'vitest';
import { makeTestDb, makeUser, type Db } from '@/lib/core/test-helpers';
import * as clientModule from '@/lib/db/client';
import { projectTools } from './projects';
import { labelTools } from './labels';
import type { ToolCtx } from './index';

let db: Db;
let ctx: ToolCtx;
beforeEach(async () => {
  const t = makeTestDb();
  db = t.db;
  vi.spyOn(clientModule, 'getDb').mockReturnValue(db as any);
  ctx = { actor: (await makeUser(db, { role: 'admin' })).actor };
});

function find<T extends { definition: { name: string } }>(arr: T[], name: string): T {
  const f = arr.find((x) => x.definition.name === name);
  if (!f) throw new Error(`missing tool ${name}`);
  return f;
}

describe('project/list/label tools', () => {
  it('martrello_create_project + martrello_archive_project', async () => {
    const create = find(projectTools, 'martrello_create_project');
    const archive = find(projectTools, 'martrello_archive_project');
    const p = (await create.handler({ name: 'foo' }, ctx)) as any;
    expect(p.name).toBe('foo');
    await archive.handler({ project: p.id }, ctx);
  });

  it('martrello_create_label works; add_label on a missing card returns CARD_NOT_FOUND', async () => {
    const createLabel = find(labelTools, 'martrello_create_label');
    await createLabel.handler({ name: 'bug', color: '#f97316' }, ctx);
    const add = find(labelTools, 'martrello_add_label');
    await expect(add.handler({ card_id: 'nope', label: 'bug' }, ctx)).rejects.toMatchObject({ code: 'CARD_NOT_FOUND' });
  });

  it('membro não cria, atualiza, arquiva nem reordena projetos (FORBIDDEN)', async () => {
    const p = (await find(projectTools, 'martrello_create_project').handler({ name: 'foo' }, ctx)) as any;
    const member: ToolCtx = { actor: (await makeUser(db)).actor };
    await expect(find(projectTools, 'martrello_create_project').handler({ name: 'bar' }, member)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(find(projectTools, 'martrello_update_project').handler({ project: p.id, name: 'x' }, member)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(find(projectTools, 'martrello_archive_project').handler({ project: p.id }, member)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(find(projectTools, 'martrello_reorder_projects').handler({ ordered_ids: [p.id] }, member)).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('membro não exclui label (FORBIDDEN)', async () => {
    await find(labelTools, 'martrello_create_label').handler({ name: 'bug', color: '#f97316' }, ctx);
    const member: ToolCtx = { actor: (await makeUser(db)).actor };
    await expect(find(labelTools, 'martrello_delete_label').handler({ label: 'bug' }, member)).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});
