// lib/core/dependencies.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { eq } from 'drizzle-orm';
import { makeTestDb, makeUser, type Db } from './test-helpers';
import { cardDependencies, lists as listsTable } from '@/lib/db/schema';
import { listCardEvents } from './events';
import type { Actor } from '@/lib/access/actor';
import { createProject, getProjectByNameOrId } from './projects';
import { createCard, moveCard, archiveCard } from './cards';
import { addDependency, removeDependency, getBlockedStatuses, getCycleFreeCandidates } from './dependencies';

let db: Db;
let close: () => void;
let admin: Actor;
beforeEach(async () => {
  const t = makeTestDb();
  db = t.db;
  close = t.close;
  admin = (await makeUser(db, { role: 'admin' })).actor;
});

async function setup(name = 'p') {
  const p = await createProject(db, admin, { name });
  const full = await getProjectByNameOrId(db, p.id);
  return { p, lists: full.lists };
}

describe('dependencies', () => {
  it('creates a dependency edge', async () => {
    const { p } = await setup();
    const a = await createCard(db, admin, { project: p.id, title: 'a' });
    const b = await createCard(db, admin, { project: p.id, title: 'b' });
    const dep = await addDependency(db, admin, b.id, a.id);
    expect(dep.blockedCardId).toBe(b.id);
    expect(dep.blockerCardId).toBe(a.id);
    close();
  });

  it('is idempotent — adding the same edge twice does not throw or duplicate', async () => {
    const { p } = await setup();
    const a = await createCard(db, admin, { project: p.id, title: 'a' });
    const b = await createCard(db, admin, { project: p.id, title: 'b' });
    await addDependency(db, admin, b.id, a.id);
    await addDependency(db, admin, b.id, a.id);
    const statuses = await getBlockedStatuses(db, [b.id]);
    expect(statuses.get(b.id)!.dependsOn).toHaveLength(1);
    close();
  });

  it('rejects a card depending on itself', async () => {
    const { p } = await setup();
    const a = await createCard(db, admin, { project: p.id, title: 'a' });
    await expect(addDependency(db, admin, a.id, a.id)).rejects.toThrow(/INVALID_INPUT/);
    close();
  });

  it('rejects cross-project dependencies', async () => {
    const { p: p1 } = await setup('p1');
    const { p: p2 } = await setup('p2');
    const a = await createCard(db, admin, { project: p1.id, title: 'a' });
    const b = await createCard(db, admin, { project: p2.id, title: 'b' });
    await expect(addDependency(db, admin, b.id, a.id)).rejects.toThrow(/CROSS_PROJECT_DEPENDENCY/);
    close();
  });

  it('rejects a direct cycle (A depends on B, B depends on A)', async () => {
    const { p } = await setup();
    const a = await createCard(db, admin, { project: p.id, title: 'a' });
    const b = await createCard(db, admin, { project: p.id, title: 'b' });
    await addDependency(db, admin, a.id, b.id); // a depends on b
    await expect(addDependency(db, admin, b.id, a.id)).rejects.toThrow(/CYCLE_DETECTED/);
    close();
  });

  it('rejects a transitive cycle (A->B->C, then C->A)', async () => {
    const { p } = await setup();
    const a = await createCard(db, admin, { project: p.id, title: 'a' });
    const b = await createCard(db, admin, { project: p.id, title: 'b' });
    const c = await createCard(db, admin, { project: p.id, title: 'c' });
    await addDependency(db, admin, a.id, b.id); // a depends on b
    await addDependency(db, admin, b.id, c.id); // b depends on c
    await expect(addDependency(db, admin, c.id, a.id)).rejects.toThrow(/CYCLE_DETECTED/);
    close();
  });

  it('removeDependency is idempotent (no-op if not present)', async () => {
    const { p } = await setup();
    const a = await createCard(db, admin, { project: p.id, title: 'a' });
    const b = await createCard(db, admin, { project: p.id, title: 'b' });
    await expect(removeDependency(db, admin, b.id, a.id)).resolves.toBeUndefined();
    close();
  });

  it('removeDependency actually deletes an existing edge', async () => {
    const { p } = await setup();
    const a = await createCard(db, admin, { project: p.id, title: 'a' });
    const b = await createCard(db, admin, { project: p.id, title: 'b' });
    await addDependency(db, admin, b.id, a.id);
    let statuses = await getBlockedStatuses(db, [b.id]);
    expect(statuses.get(b.id)!.dependsOn).toHaveLength(1);
    expect(statuses.get(b.id)!.isBlocked).toBe(true);

    await removeDependency(db, admin, b.id, a.id);
    statuses = await getBlockedStatuses(db, [b.id]);
    expect(statuses.get(b.id)!.dependsOn).toEqual([]);
    expect(statuses.get(b.id)!.isBlocked).toBe(false);
    close();
  });

  it('a card with no dependencies is never blocked', async () => {
    const { p } = await setup();
    const a = await createCard(db, admin, { project: p.id, title: 'a' });
    const statuses = await getBlockedStatuses(db, [a.id]);
    expect(statuses.get(a.id)).toEqual({ isBlocked: false, dependsOn: [] });
    close();
  });

  it('is blocked while the blocker is not in Feito', async () => {
    const { p } = await setup();
    const a = await createCard(db, admin, { project: p.id, title: 'a' }); // starts in Backlog
    const b = await createCard(db, admin, { project: p.id, title: 'b' });
    await addDependency(db, admin, b.id, a.id);
    const statuses = await getBlockedStatuses(db, [b.id]);
    expect(statuses.get(b.id)!.isBlocked).toBe(true);
    expect(statuses.get(b.id)!.dependsOn).toEqual([{ id: a.id, title: 'a', isDone: false }]);
    close();
  });

  it('unblocks once the blocker reaches Feito', async () => {
    const { p, lists } = await setup();
    const a = await createCard(db, admin, { project: p.id, title: 'a' });
    const b = await createCard(db, admin, { project: p.id, title: 'b' });
    await addDependency(db, admin, b.id, a.id);
    const lastList = lists[lists.length - 1]; // "Feito"
    await moveCard(db, admin, a.id, { toList: lastList.id });
    const statuses = await getBlockedStatuses(db, [b.id]);
    expect(statuses.get(b.id)!.isBlocked).toBe(false);
    expect(statuses.get(b.id)!.dependsOn[0].isDone).toBe(true);
    close();
  });

  it('unblocks if the blocker is archived instead of moved', async () => {
    const { p } = await setup();
    const a = await createCard(db, admin, { project: p.id, title: 'a' });
    const b = await createCard(db, admin, { project: p.id, title: 'b' });
    await addDependency(db, admin, b.id, a.id);
    await archiveCard(db, admin, a.id);
    const statuses = await getBlockedStatuses(db, [b.id]);
    expect(statuses.get(b.id)!.isBlocked).toBe(false);
    close();
  });

  it('stays blocked if only some blockers are done', async () => {
    const { p, lists } = await setup();
    const a = await createCard(db, admin, { project: p.id, title: 'a' });
    const b = await createCard(db, admin, { project: p.id, title: 'b' });
    const c = await createCard(db, admin, { project: p.id, title: 'c' });
    await addDependency(db, admin, c.id, a.id);
    await addDependency(db, admin, c.id, b.id);
    await moveCard(db, admin, a.id, { toList: lists[lists.length - 1].id }); // only a done
    const statuses = await getBlockedStatuses(db, [c.id]);
    expect(statuses.get(c.id)!.isBlocked).toBe(true);
    close();
  });

  it('getBlockedStatuses returns an entry for every requested id, including ones with no deps', async () => {
    const { p } = await setup();
    const a = await createCard(db, admin, { project: p.id, title: 'a' });
    const b = await createCard(db, admin, { project: p.id, title: 'b' });
    await addDependency(db, admin, b.id, a.id);
    const statuses = await getBlockedStatuses(db, [a.id, b.id]);
    expect(statuses.get(a.id)).toEqual({ isBlocked: false, dependsOn: [] });
    expect(statuses.get(b.id)!.isBlocked).toBe(true);
    close();
  });

  it('getBlockedStatuses ignora bloqueadores de outro projeto (resto de dados antigos)', async () => {
    const { p } = await setup('p');
    const { p: q } = await setup('q');
    const a = await createCard(db, admin, { project: p.id, title: 'mesmo projeto' });
    const b = await createCard(db, admin, { project: p.id, title: 'bloqueado' });
    const hidden = await createCard(db, admin, { project: q.id, title: 'título secreto' });
    await addDependency(db, admin, b.id, a.id);
    // A leftover edge from before dependencies were dropped on project moves.
    db.insert(cardDependencies).values({ blockedCardId: b.id, blockerCardId: hidden.id, createdAt: 1 }).run();
    const status = (await getBlockedStatuses(db, [b.id])).get(b.id)!;
    expect(status.dependsOn.map((d) => d.title)).toEqual(['mesmo projeto']);
    expect(status.isBlocked).toBe(true);
    await moveCard(db, admin, a.id, { toList: 'Feito' });
    expect((await getBlockedStatuses(db, [b.id])).get(b.id)).toEqual({
      isBlocked: false, dependsOn: [{ id: a.id, title: 'mesmo projeto', isDone: true }],
    });
    close();
  });

  it('bloqueador em Feito conta como concluído', async () => {
    const { p } = await setup();
    const a = await createCard(db, admin, { project: p.id, title: 'a' });
    const b = await createCard(db, admin, { project: p.id, title: 'b' });
    await addDependency(db, admin, b.id, a.id);
    await moveCard(db, admin, a.id, { toList: 'Feito' });
    // "Concluída" depende da etapa, não da posição da lista: Feito deixa de ser a última.
    const full = await getProjectByNameOrId(db, p.id);
    const doneList = full.lists.find((l) => l.stage === 'done')!;
    db.update(listsTable).set({ position: -1 }).where(eq(listsTable.id, doneList.id)).run();
    const statuses = await getBlockedStatuses(db, [b.id]);
    expect(statuses.get(b.id)!.isBlocked).toBe(false);
    expect(statuses.get(b.id)!.dependsOn[0].isDone).toBe(true);
    close();
  });

  it('registra dependency_added e dependency_removed no card bloqueado', async () => {
    const { p } = await setup();
    const a = await createCard(db, admin, { project: p.id, title: 'a' });
    const b = await createCard(db, admin, { project: p.id, title: 'b' });
    await addDependency(db, admin, b.id, a.id);
    await addDependency(db, admin, b.id, a.id); // idempotente: sem segundo evento
    await removeDependency(db, admin, b.id, a.id);
    await removeDependency(db, admin, b.id, a.id); // idempotente: sem segundo evento
    const events = (await listCardEvents(db, admin, b.id)).filter((e) => e.type !== 'created');
    expect(events.map((e) => [e.type, e.from, e.to])).toEqual([
      ['dependency_added', null, a.id],
      ['dependency_removed', a.id, null],
    ]);
    close();
  });

  describe('getCycleFreeCandidates', () => {
    it('excludes a transitive-cycle candidate while keeping safe ones', async () => {
      const { p } = await setup();
      const a = await createCard(db, admin, { project: p.id, title: 'a' });
      const b = await createCard(db, admin, { project: p.id, title: 'b' });
      const c = await createCard(db, admin, { project: p.id, title: 'c' });
      const d = await createCard(db, admin, { project: p.id, title: 'd' });
      await addDependency(db, admin, a.id, b.id); // a depends on b
      await addDependency(db, admin, b.id, c.id); // b depends on c (a -> b -> c transitively)

      // Picking a as a new blocker of c would close the loop (a is transitively blocked
      // by c via a -> b -> c), so a must be excluded. d is unrelated and safe.
      const safe = await getCycleFreeCandidates(db, c.id, [a.id, d.id]);
      expect(safe).not.toContain(a.id);
      expect(safe).toContain(d.id);
    });
  });
});
