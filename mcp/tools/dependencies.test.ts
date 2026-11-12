import { describe, it, expect, beforeEach, vi } from 'vitest';
import { makeTestDb, makeUser, type Db } from '@/lib/core/test-helpers';
import * as clientModule from '@/lib/db/client';
import { createProject } from '@/lib/core/projects';
import { createCard } from '@/lib/core/cards';
import { dependencyTools } from './dependencies';
import type { ToolCtx } from './index';

let db: Db;
let ctx: ToolCtx;
beforeEach(async () => {
  const t = makeTestDb();
  db = t.db;
  vi.spyOn(clientModule, 'getDb').mockReturnValue(db as any);
  ctx = { actor: (await makeUser(db, { role: 'admin' })).actor };
});

const find = (name: string) => dependencyTools.find((t) => t.definition.name === name)!;

describe('dependency tools', () => {
  it('martrello_add_dependency creates the edge', async () => {
    const p = await createProject(db, ctx.actor, { name: 'p' });
    const a = await createCard(db, ctx.actor, { project: p.id, title: 'a' });
    const b = await createCard(db, ctx.actor, { project: p.id, title: 'b' });
    const result: any = await find('martrello_add_dependency').handler({ card_id: b.id, blocker_card_id: a.id }, ctx);
    expect(result.blockedCardId).toBe(b.id);
    expect(result.blockerCardId).toBe(a.id);
  });

  it('martrello_remove_dependency removes the edge', async () => {
    const p = await createProject(db, ctx.actor, { name: 'p' });
    const a = await createCard(db, ctx.actor, { project: p.id, title: 'a' });
    const b = await createCard(db, ctx.actor, { project: p.id, title: 'b' });
    await find('martrello_add_dependency').handler({ card_id: b.id, blocker_card_id: a.id }, ctx);
    const result = await find('martrello_remove_dependency').handler({ card_id: b.id, blocker_card_id: a.id }, ctx);
    expect(result).toEqual({ ok: true });
  });
});
