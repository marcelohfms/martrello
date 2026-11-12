import { describe, it, expect, afterEach } from 'vitest';
import { makeTestDb, makeUser, addMemberRow } from './test-helpers';
import { projects, lists, cards } from '@/lib/db/schema';
import { SYSTEM_ACTOR } from '@/lib/access/actor';
import { recordCardEvent, listCardEvents } from './events';

let close: (() => void) | undefined;
afterEach(() => { close?.(); close = undefined; });

describe('card events', () => {
  it('listCardEvents traz nome do autor e null para o sistema, em ordem', async () => {
    const t = makeTestDb();
    close = t.close;
    const { db } = t;
    db.insert(projects).values({ id: 'p1', name: 'P1', acronym: 'P', color: '#000', position: 1, createdAt: 1 }).run();
    db.insert(lists).values({ id: 'l1', projectId: 'p1', name: 'B', stage: 'backlog', position: 1, createdAt: 1 }).run();
    db.insert(cards).values({ id: 'c1', projectId: 'p1', listId: 'l1', title: 't', position: 1, createdAt: 1, updatedAt: 1 }).run();
    const { user, actor } = await makeUser(db, { name: 'Ana' });
    addMemberRow(db, 'p1', user.id);

    // inside a sync transaction
    db.transaction((tx) => {
      recordCardEvent(tx as never, { cardId: 'c1', actor, type: 'title', from: 'a', to: 'b', at: 200 });
      recordCardEvent(tx as never, { cardId: 'c1', actor: SYSTEM_ACTOR, type: 'migrated', at: 100 });
    });

    const events = await listCardEvents(db, actor, 'c1');
    expect(events.map((e) => e.type)).toEqual(['migrated', 'title']);
    expect(events[0]).toMatchObject({ actorName: null, from: null, to: null, at: 100 });
    expect(events[1]).toMatchObject({ actorName: 'Ana', from: 'a', to: 'b', at: 200 });

    const { actor: outsider } = await makeUser(db, { email: 'o@x.com' });
    await expect(listCardEvents(db, outsider, 'c1')).rejects.toMatchObject({ code: 'CARD_NOT_FOUND' });
  });
});
