// lib/core/sprint.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { makeTestDb, type Db } from './test-helpers';
import { createProject, getProjectByNameOrId } from './projects';
import { createCard, getCardById } from './cards';
import {
  startSprint, getActiveSprint, addToSprint, moveInSprint, removeFromSprint,
  closeSprint, listSprints, getSprintHistory,
} from './sprint';

let db: Db;
let close: () => void;
beforeEach(() => { const t = makeTestDb(); db = t.db; close = t.close; });

async function makeCard(project = 'p') {
  await createProject(db, { name: project }).catch(() => {});
  const full = await getProjectByNameOrId(db, project);
  return createCard(db, { project, title: `task-${Math.random().toString(36).slice(2, 6)}`, list: full.lists[0].id });
}

describe('sprint', () => {
  it('starts a sprint with auto-generated name', async () => {
    const s = await startSprint(db);
    expect(s.name).toBe('Sprint 1');
    expect(s.closedAt).toBeNull();
    close();
  });

  it('refuses to start when one is active', async () => {
    await startSprint(db);
    await expect(startSprint(db)).rejects.toThrow(/SPRINT_ALREADY_ACTIVE/);
    close();
  });

  it('adds a card to backlog by default', async () => {
    await startSprint(db);
    const c = await makeCard();
    const slot = await addToSprint(db, c.id);
    expect(slot.sprintList).toBe('backlog');
    close();
  });

  it('add_to_sprint is idempotent (updates list/position instead of duplicating)', async () => {
    await startSprint(db);
    const c = await makeCard();
    await addToSprint(db, c.id, 'backlog');
    const updated = await addToSprint(db, c.id, 'doing');
    expect(updated.sprintList).toBe('doing');
    const active = await getActiveSprint(db);
    expect(active!.cards.filter((card) => card.id === c.id)).toHaveLength(1);
    close();
  });

  it('moves card within sprint', async () => {
    await startSprint(db);
    const c = await makeCard();
    await addToSprint(db, c.id, 'backlog');
    await moveInSprint(db, c.id, 'done');
    const active = await getActiveSprint(db);
    expect(active!.cards.find((x) => x.id === c.id)!.sprintList).toBe('done');
    close();
  });

  it('removeFromSprint deletes slot', async () => {
    await startSprint(db);
    const c = await makeCard();
    await addToSprint(db, c.id);
    await removeFromSprint(db, c.id);
    const active = await getActiveSprint(db);
    expect(active!.cards.find((x) => x.id === c.id)).toBeUndefined();
    close();
  });

  it('closes sprint with carry: done is archived, others move to new sprint with preserved column', async () => {
    const s1 = await startSprint(db);
    const a = await makeCard();
    const b = await makeCard();
    const c = await makeCard();
    await addToSprint(db, a.id, 'done');
    await addToSprint(db, b.id, 'doing');
    await addToSprint(db, c.id, 'backlog');

    const result = await closeSprint(db, { carryIncomplete: true });
    expect(result.closed.id).toBe(s1.id);
    expect(result.closed.doneCount).toBe(1);
    expect(result.closed.carriedCount).toBe(2);
    expect(result.opened).toBeDefined();

    // a is archived
    const archived = await getCardById(db, a.id);
    expect(archived.archivedAt).not.toBeNull();

    // active sprint exists, with b in 'doing' and c in 'backlog'
    const active = await getActiveSprint(db);
    expect(active!.id).toBe(result.opened!.id);
    const slots = active!.cards;
    expect(slots.find((x) => x.id === b.id)!.sprintList).toBe('doing');
    expect(slots.find((x) => x.id === c.id)!.sprintList).toBe('backlog');

    // snapshot persisted
    const history = await getSprintHistory(db, s1.id);
    expect(history.cards).toHaveLength(3);
    close();
  });

  it('closes sprint without carry: incomplete slots are deleted, no new sprint opens', async () => {
    await startSprint(db);
    const a = await makeCard();
    const b = await makeCard();
    await addToSprint(db, a.id, 'done');
    await addToSprint(db, b.id, 'backlog');

    const result = await closeSprint(db, { carryIncomplete: false });
    expect(result.opened).toBeUndefined();
    expect(result.closed.carriedCount).toBe(0);

    const active = await getActiveSprint(db);
    expect(active).toBeNull();
    close();
  });

  it('auto-numbers sprint name based on total count', async () => {
    await startSprint(db);
    await closeSprint(db, { carryIncomplete: false });
    const s2 = await startSprint(db);
    expect(s2.name).toBe('Sprint 2');
    close();
  });

  it('lists sprints in reverse chronological order', async () => {
    const s1 = await startSprint(db);
    await closeSprint(db, { carryIncomplete: false });
    const s2 = await startSprint(db);
    const all = await listSprints(db);
    expect(all.map((s) => s.id)).toEqual([s2.id, s1.id]);
    close();
  });
});
