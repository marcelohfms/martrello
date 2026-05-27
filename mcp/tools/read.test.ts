import { describe, it, expect, beforeEach, vi } from 'vitest';
import { makeTestDb, type Db } from '@/lib/core/test-helpers';
import { createProject } from '@/lib/core/projects';
import { createLabel } from '@/lib/core/labels';
import * as clientModule from '@/lib/db/client';
import { readTools } from './read';

let db: Db;
beforeEach(() => {
  const t = makeTestDb();
  db = t.db;
  vi.spyOn(clientModule, 'getDb').mockReturnValue(db as any);
});

describe('read tools', () => {
  it('list_projects returns names', async () => {
    await createProject(db, { name: 'a' });
    const tool = readTools.find((t) => t.definition.name === 'martrello_list_projects')!;
    const out = (await tool.handler({})) as Array<{ name: string }>;
    expect(out.map((p) => p.name)).toContain('a');
  });

  it('list_labels returns labels', async () => {
    await createLabel(db, 'urgente', '#ef4444');
    const tool = readTools.find((t) => t.definition.name === 'martrello_list_labels')!;
    const out = (await tool.handler({})) as Array<{ name: string }>;
    expect(out.map((l) => l.name)).toEqual(['urgente']);
  });

  it('get_project errors with suggestions', async () => {
    await createProject(db, { name: 'martrello' });
    const tool = readTools.find((t) => t.definition.name === 'martrello_get_project')!;
    await expect(tool.handler({ project: 'martelo' })).rejects.toThrow(/PROJECT_NOT_FOUND/);
  });
});
