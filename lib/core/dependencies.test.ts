// lib/core/dependencies.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { makeTestDb, type Db } from './test-helpers';
import { createProject, getProjectByNameOrId } from './projects';
import { createCard, moveCard, archiveCard } from './cards';
import { addDependency, removeDependency, getBlockedStatuses } from './dependencies';

let db: Db;
let close: () => void;
beforeEach(() => { const t = makeTestDb(); db = t.db; close = t.close; });

async function setup(name = 'p') {
  const p = await createProject(db, { name });
  const full = await getProjectByNameOrId(db, p.id);
  return { p, lists: full.lists };
}

describe('dependencies', () => {
  it('creates a dependency edge', async () => {
    const { p } = await setup();
    const a = await createCard(db, { project: p.id, title: 'a' });
    const b = await createCard(db, { project: p.id, title: 'b' });
    const dep = await addDependency(db, b.id, a.id);
    expect(dep.blockedCardId).toBe(b.id);
    expect(dep.blockerCardId).toBe(a.id);
    close();
  });

  it('is idempotent — adding the same edge twice does not throw or duplicate', async () => {
    const { p } = await setup();
    const a = await createCard(db, { project: p.id, title: 'a' });
    const b = await createCard(db, { project: p.id, title: 'b' });
    await addDependency(db, b.id, a.id);
    await addDependency(db, b.id, a.id);
    const statuses = await getBlockedStatuses(db, [b.id]);
    expect(statuses.get(b.id)!.dependsOn).toHaveLength(1);
    close();
  });

  it('rejects a card depending on itself', async () => {
    const { p } = await setup();
    const a = await createCard(db, { project: p.id, title: 'a' });
    await expect(addDependency(db, a.id, a.id)).rejects.toThrow(/INVALID_INPUT/);
    close();
  });

  it('rejects cross-project dependencies', async () => {
    const { p: p1 } = await setup('p1');
    const { p: p2 } = await setup('p2');
    const a = await createCard(db, { project: p1.id, title: 'a' });
    const b = await createCard(db, { project: p2.id, title: 'b' });
    await expect(addDependency(db, b.id, a.id)).rejects.toThrow(/CROSS_PROJECT_DEPENDENCY/);
    close();
  });

  it('rejects a direct cycle (A depends on B, B depends on A)', async () => {
    const { p } = await setup();
    const a = await createCard(db, { project: p.id, title: 'a' });
    const b = await createCard(db, { project: p.id, title: 'b' });
    await addDependency(db, a.id, b.id); // a depends on b
    await expect(addDependency(db, b.id, a.id)).rejects.toThrow(/CYCLE_DETECTED/);
    close();
  });

  it('rejects a transitive cycle (A->B->C, then C->A)', async () => {
    const { p } = await setup();
    const a = await createCard(db, { project: p.id, title: 'a' });
    const b = await createCard(db, { project: p.id, title: 'b' });
    const c = await createCard(db, { project: p.id, title: 'c' });
    await addDependency(db, a.id, b.id); // a depends on b
    await addDependency(db, b.id, c.id); // b depends on c
    await expect(addDependency(db, c.id, a.id)).rejects.toThrow(/CYCLE_DETECTED/);
    close();
  });

  it('removeDependency is idempotent (no-op if not present)', async () => {
    const { p } = await setup();
    const a = await createCard(db, { project: p.id, title: 'a' });
    const b = await createCard(db, { project: p.id, title: 'b' });
    await expect(removeDependency(db, b.id, a.id)).resolves.toBeUndefined();
    close();
  });

  it('a card with no dependencies is never blocked', async () => {
    const { p } = await setup();
    const a = await createCard(db, { project: p.id, title: 'a' });
    const statuses = await getBlockedStatuses(db, [a.id]);
    expect(statuses.get(a.id)).toEqual({ isBlocked: false, dependsOn: [] });
    close();
  });

  it('is blocked while the blocker is not in the last list', async () => {
    const { p } = await setup();
    const a = await createCard(db, { project: p.id, title: 'a' }); // starts in "A fazer"
    const b = await createCard(db, { project: p.id, title: 'b' });
    await addDependency(db, b.id, a.id);
    const statuses = await getBlockedStatuses(db, [b.id]);
    expect(statuses.get(b.id)!.isBlocked).toBe(true);
    expect(statuses.get(b.id)!.dependsOn).toEqual([{ id: a.id, title: 'a', isDone: false }]);
    close();
  });

  it('unblocks once the blocker reaches the last list', async () => {
    const { p, lists } = await setup();
    const a = await createCard(db, { project: p.id, title: 'a' });
    const b = await createCard(db, { project: p.id, title: 'b' });
    await addDependency(db, b.id, a.id);
    const lastList = lists[lists.length - 1]; // "Feito"
    await moveCard(db, a.id, { toList: lastList.id });
    const statuses = await getBlockedStatuses(db, [b.id]);
    expect(statuses.get(b.id)!.isBlocked).toBe(false);
    expect(statuses.get(b.id)!.dependsOn[0].isDone).toBe(true);
    close();
  });

  it('unblocks if the blocker is archived instead of moved', async () => {
    const { p } = await setup();
    const a = await createCard(db, { project: p.id, title: 'a' });
    const b = await createCard(db, { project: p.id, title: 'b' });
    await addDependency(db, b.id, a.id);
    await archiveCard(db, a.id);
    const statuses = await getBlockedStatuses(db, [b.id]);
    expect(statuses.get(b.id)!.isBlocked).toBe(false);
    close();
  });

  it('stays blocked if only some blockers are done', async () => {
    const { p, lists } = await setup();
    const a = await createCard(db, { project: p.id, title: 'a' });
    const b = await createCard(db, { project: p.id, title: 'b' });
    const c = await createCard(db, { project: p.id, title: 'c' });
    await addDependency(db, c.id, a.id);
    await addDependency(db, c.id, b.id);
    await moveCard(db, a.id, { toList: lists[lists.length - 1].id }); // only a done
    const statuses = await getBlockedStatuses(db, [c.id]);
    expect(statuses.get(c.id)!.isBlocked).toBe(true);
    close();
  });

  it('getBlockedStatuses returns an entry for every requested id, including ones with no deps', async () => {
    const { p } = await setup();
    const a = await createCard(db, { project: p.id, title: 'a' });
    const b = await createCard(db, { project: p.id, title: 'b' });
    await addDependency(db, b.id, a.id);
    const statuses = await getBlockedStatuses(db, [a.id, b.id]);
    expect(statuses.get(a.id)).toEqual({ isBlocked: false, dependsOn: [] });
    expect(statuses.get(b.id)!.isBlocked).toBe(true);
    close();
  });
});
