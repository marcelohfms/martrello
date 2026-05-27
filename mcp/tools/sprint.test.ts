import { describe, it, expect, beforeEach, vi } from 'vitest';
import { makeTestDb, type Db } from '@/lib/core/test-helpers';
import * as clientModule from '@/lib/db/client';
import { sprintTools } from './sprint';
import { projectTools } from './projects';
import { cardTools } from './cards';

let db: Db;
beforeEach(() => {
  const t = makeTestDb();
  db = t.db;
  vi.spyOn(clientModule, 'getDb').mockReturnValue(db as any);
});

const find = (name: string) =>
  [...projectTools, ...cardTools, ...sprintTools].find((t) => t.definition.name === name)!;

describe('sprint tools', () => {
  it('start, add, move, close round-trip', async () => {
    await find('martrello_create_project').handler({ name: 'p' });
    const s: any = await find('martrello_start_sprint').handler({});
    expect(s.name).toBe('Sprint 1');

    const c1: any = await find('martrello_create_card').handler({ project: 'p', title: 'a' });
    const c2: any = await find('martrello_create_card').handler({ project: 'p', title: 'b' });

    await find('martrello_add_to_sprint').handler({ card_id: c1.id });
    await find('martrello_add_to_sprint').handler({ card_id: c2.id, sprint_list: 'doing' });
    await find('martrello_move_in_sprint').handler({ card_id: c1.id, sprint_list: 'done' });

    const result: any = await find('martrello_close_sprint').handler({});
    expect(result.closed.doneCount).toBe(1);
    expect(result.closed.carriedCount).toBe(1);
    expect(result.opened).toBeDefined();
  });

  it('rejects start when active', async () => {
    await find('martrello_start_sprint').handler({});
    await expect(find('martrello_start_sprint').handler({})).rejects.toThrow(/SPRINT_ALREADY_ACTIVE/);
  });
});
