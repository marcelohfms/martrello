import { describe, it, expect, beforeEach, vi } from 'vitest';
import { makeTestDb, makeUser, type Db } from '@/lib/core/test-helpers';
import * as clientModule from '@/lib/db/client';
import { sprintTools } from './sprint';
import { projectTools } from './projects';
import { cardTools } from './cards';
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
  [...projectTools, ...cardTools, ...sprintTools].find((t) => t.definition.name === name)!;

describe('sprint tools', () => {
  it('start, add, move, close round-trip', async () => {
    await find('martrello_create_project').handler({ name: 'p' }, ctx);
    const s: any = await find('martrello_start_sprint').handler({}, ctx);
    expect(s.name).toBe('Sprint 1');

    const c1: any = await find('martrello_create_card').handler({ project: 'p', title: 'a' }, ctx);
    const c2: any = await find('martrello_create_card').handler({ project: 'p', title: 'b' }, ctx);

    await find('martrello_add_to_sprint').handler({ card_id: c1.id }, ctx);
    await find('martrello_add_to_sprint').handler({ card_id: c2.id, sprint_list: 'doing' }, ctx);
    await find('martrello_move_in_sprint').handler({ card_id: c1.id, sprint_list: 'done' }, ctx);

    const result: any = await find('martrello_close_sprint').handler({}, ctx);
    expect(result.closed.doneCount).toBe(1);
    expect(result.closed.carriedCount).toBe(1);
    expect(result.opened).toBeDefined();
  });

  it('rejects start when active', async () => {
    await find('martrello_start_sprint').handler({}, ctx);
    await expect(find('martrello_start_sprint').handler({}, ctx)).rejects.toThrow(/SPRINT_ALREADY_ACTIVE/);
  });
});
