import { describe, it, expect, beforeEach, vi } from 'vitest';
import { makeTestDb, type Db } from '@/lib/core/test-helpers';
import * as clientModule from '@/lib/db/client';
import { projectTools } from './projects';
import { listTools } from './lists';
import { labelTools } from './labels';

let db: Db;
beforeEach(() => {
  const t = makeTestDb();
  db = t.db;
  vi.spyOn(clientModule, 'getDb').mockReturnValue(db as any);
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
    const p = (await create.handler({ name: 'foo' })) as any;
    expect(p.name).toBe('foo');
    await archive.handler({ project: p.id });
  });

  it('martrello_create_list under existing project', async () => {
    const createProj = find(projectTools, 'martrello_create_project');
    const createList = find(listTools, 'martrello_create_list');
    const p = (await createProj.handler({ name: 'foo' })) as any;
    const l = (await createList.handler({ project: 'foo', name: 'Bloqueado' })) as any;
    expect(l.projectId).toBe(p.id);
  });

  it('martrello_create_label works; add_label on a missing card surfaces an error from FK', async () => {
    const createLabel = find(labelTools, 'martrello_create_label');
    await createLabel.handler({ name: 'bug', color: '#f97316' });
    const add = find(labelTools, 'martrello_add_label');
    // FK constraint on card_labels.card_id should reject when card_id doesn't exist
    await expect(add.handler({ card_id: 'nope', label: 'bug' })).rejects.toThrow();
  });
});
