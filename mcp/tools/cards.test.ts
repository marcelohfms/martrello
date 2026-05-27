import { describe, it, expect, beforeEach, vi } from 'vitest';
import { makeTestDb, type Db } from '@/lib/core/test-helpers';
import * as clientModule from '@/lib/db/client';
import { cardTools } from './cards';
import { projectTools } from './projects';

let db: Db;
beforeEach(() => {
  const t = makeTestDb();
  db = t.db;
  vi.spyOn(clientModule, 'getDb').mockReturnValue(db as any);
});

const find = (name: string) =>
  [...projectTools, ...cardTools].find((t) => t.definition.name === name)!;

describe('card tools', () => {
  it('creates and moves a card', async () => {
    await find('martrello_create_project').handler({ name: 'p' });
    const c: any = await find('martrello_create_card').handler({ project: 'p', title: 'hi' });
    expect(c.title).toBe('hi');
    await find('martrello_update_card').handler({ id: c.id, title: 'bye' });
  });

  it('archive_card succeeds', async () => {
    await find('martrello_create_project').handler({ name: 'p' });
    const c: any = await find('martrello_create_card').handler({ project: 'p', title: 'x' });
    await find('martrello_archive_card').handler({ id: c.id });
  });
});
