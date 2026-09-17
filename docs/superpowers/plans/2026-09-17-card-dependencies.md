# Card Dependencies Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a card declare that it's blocked by one or more other cards in the
same project, and surface that visually (amber border + lock icon) on the
board and in the sprint, with the blocked state clearing itself automatically
once every blocker reaches the project's last list (or is archived).

**Architecture:** A new `card_dependencies` join table stores directed edges
(`blockedCardId` depends on `blockerCardId`). Blocked status is **never
cached** — `lib/core/dependencies.ts` exports `getBlockedStatuses(db, cardIds)`,
a bulk function computed fresh on every read (board load, sprint load, single
card fetch), because this is a personal tool with a small number of cards per
project and a cache would need cross-card invalidation on every move. Writes
go through `addDependency`/`removeDependency`, which enforce same-project and
no-cycle rules — the only two invariants not expressible as a SQL constraint
in SQLite. Both the web UI (Server Actions + `CardPanel`) and the MCP server
call the same `lib/core` functions, so there's exactly one place the rules
live.

**Tech Stack:** Next.js 16 (App Router, Server Components + Server Actions),
Drizzle ORM + better-sqlite3, Vitest, MCP SDK (stdio tools).

**Spec:** [docs/superpowers/specs/2026-09-17-card-dependencies-design.md](../specs/2026-09-17-card-dependencies-design.md)

## Global Constraints

- Dependencies only within the same project — cross-project is rejected with a
  structured `MartrelloError`.
- A card can have multiple blockers; it's blocked if **any** blocker is not
  "done" (done = in the project's last list by `position`, or archived).
- No cycles, direct or transitive — checked at write time via graph traversal,
  not a DB constraint.
- No caching of blocked status anywhere (component state, DB column, or
  otherwise) — always computed from `card_dependencies` + `cards` + `lists` at
  read time.
- This repo has no `.tsx` test setup (vitest.config.ts only includes
  `tests/**`, `lib/**`, `mcp/**` `.test.ts` files, no jsdom). Don't add one for
  this feature — verify UI changes by running the app in the browser, per the
  existing convention (see e.g. the realtime-sse and deadline-picker specs,
  which did the same).
- Follow the existing `lib/core` pattern exactly: functions take `(db: Db,
  ...)`, throw `MartrelloError` with an existing or new `ErrorCode`, and are
  covered by a co-located `*.test.ts` using `makeTestDb()`.
- **Deviation from the spec, resolved here:** the spec (section 8) says
  `martrello_get_project` should include dependency info per card. In the
  actual code, `martrello_get_project` → `getProjectByNameOrId` returns only
  `{ ...project, lists }` — **no card data at all**, today, regardless of this
  feature. Adding cards to `get_project`'s response is an unrelated, bigger
  change and out of scope here. Dependency info is exposed via
  `martrello_get_card` (Task 3), the board page (Task 3), and
  `martrello_get_sprint` (already covered, since it consumes `SprintCard` from
  Task 3) — that covers every place cards are actually read today.

---

### Task 1: Schema + error codes for dependencies

**Files:**
- Modify: `lib/db/schema.ts`
- Modify: `lib/errors.ts`
- Generate: `lib/db/migrations/000X_*.sql` (via `pnpm db:generate`, not hand-written)

**Interfaces:**
- Produces: `cardDependencies` table (Drizzle table object) with columns
  `blockedCardId: text`, `blockerCardId: text`, `createdAt: integer`,
  composite primary key `(blockedCardId, blockerCardId)`, indexes
  `deps_by_blocked` on `blockedCardId` and `deps_by_blocker` on
  `blockerCardId`, both FKs `references(() => cards.id, { onDelete: 'cascade' })`.
  Exported type: `CardDependency = typeof cardDependencies.$inferSelect`.
- Produces: two new `ErrorCode` values, `'CROSS_PROJECT_DEPENDENCY'` and
  `'CYCLE_DETECTED'`, used by Task 2.

- [ ] **Step 1: Add the `cardDependencies` table to the schema**

Edit `lib/db/schema.ts`. Add this block after the `cardLabels` table
definition (right before the `// Invariant: at most one row...` comment above
`sprints`):

```ts
export const cardDependencies = sqliteTable(
  'card_dependencies',
  {
    blockedCardId: text('blocked_card_id').notNull().references(() => cards.id, { onDelete: 'cascade' }),
    blockerCardId: text('blocker_card_id').notNull().references(() => cards.id, { onDelete: 'cascade' }),
    createdAt: integer('created_at').notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.blockedCardId, t.blockerCardId] }),
    byBlocked: index('deps_by_blocked').on(t.blockedCardId),
    byBlocker: index('deps_by_blocker').on(t.blockerCardId),
  }),
);
```

And add this line next to the other `export type` lines near the bottom of
the file:

```ts
export type CardDependency = typeof cardDependencies.$inferSelect;
```

- [ ] **Step 2: Add the two new error codes**

Edit `lib/errors.ts`. Add to the `ErrorCode` union (anywhere in the list, e.g.
right after `'INVALID_INPUT'`):

```ts
  | 'CROSS_PROJECT_DEPENDENCY'
  | 'CYCLE_DETECTED';
```

(Remember to move the trailing `;` off `'INVALID_INPUT'` onto the new last
entry.)

- [ ] **Step 3: Generate the migration**

Run:
```bash
pnpm db:generate
```
Expected: a new file appears under `lib/db/migrations/`, e.g.
`0001_<random-name>.sql`, containing a `CREATE TABLE card_dependencies (...)`
statement plus the two `CREATE INDEX` statements, and
`lib/db/migrations/meta/` gets a new snapshot + updated `_journal.json`.

- [ ] **Step 4: Apply the migration to the local dev DB**

Run:
```bash
pnpm db:migrate
```
Expected output: `migrations applied` (same message you saw when the DB was
first created).

- [ ] **Step 5: Commit**

```bash
git add lib/db/schema.ts lib/errors.ts lib/db/migrations
git commit -m "feat(schema): add card_dependencies table"
```

---

### Task 2: `lib/core/dependencies.ts` — mutations + blocked-status computation

**Files:**
- Create: `lib/core/dependencies.ts`
- Create: `lib/core/dependencies.test.ts`

**Interfaces:**
- Consumes: `cards`, `lists`, `cardDependencies` from `@/lib/db/schema`;
  `MartrelloError` from `@/lib/errors`; `Db` type from `./test-helpers`.
- Produces (used by Task 3, Task 5, Task 6):
  - `type DependencyInfo = { id: string; title: string; isDone: boolean }`
  - `type BlockedStatus = { isBlocked: boolean; dependsOn: DependencyInfo[] }`
  - `addDependency(db: Db, blockedCardId: string, blockerCardId: string): Promise<CardDependency>`
  - `removeDependency(db: Db, blockedCardId: string, blockerCardId: string): Promise<void>`
  - `getBlockedStatuses(db: Db, cardIds: string[]): Promise<Map<string, BlockedStatus>>`

- [ ] **Step 1: Write the failing tests**

Create `lib/core/dependencies.test.ts`:

```ts
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run:
```bash
pnpm vitest run lib/core/dependencies.test.ts
```
Expected: FAIL — `Cannot find module './dependencies'` (the file doesn't
exist yet).

- [ ] **Step 3: Implement `lib/core/dependencies.ts`**

```ts
// lib/core/dependencies.ts
import { and, eq, inArray } from 'drizzle-orm';
import { cardDependencies, cards, lists, type CardDependency } from '@/lib/db/schema';
import { MartrelloError } from '@/lib/errors';
import type { Db } from './test-helpers';

export type DependencyInfo = { id: string; title: string; isDone: boolean };
export type BlockedStatus = { isBlocked: boolean; dependsOn: DependencyInfo[] };

async function loadCardOrThrow(db: Db, id: string) {
  const card = (await db.select().from(cards).where(eq(cards.id, id)))[0];
  if (!card) throw new MartrelloError('CARD_NOT_FOUND', `Card ${id} não existe`);
  return card;
}

// BFS from blockerCardId following "is blocked by" edges. If blockedCardId is
// reachable, it means blockerCardId already (transitively) depends on
// blockedCardId — so adding blockedCardId -> blockerCardId would close a loop.
async function wouldCreateCycle(db: Db, blockedCardId: string, blockerCardId: string): Promise<boolean> {
  const visited = new Set<string>();
  const queue = [blockerCardId];
  while (queue.length > 0) {
    const current = queue.shift()!;
    if (current === blockedCardId) return true;
    if (visited.has(current)) continue;
    visited.add(current);
    const rows = await db.select().from(cardDependencies).where(eq(cardDependencies.blockedCardId, current));
    for (const r of rows) queue.push(r.blockerCardId);
  }
  return false;
}

export async function addDependency(
  db: Db,
  blockedCardId: string,
  blockerCardId: string,
): Promise<CardDependency> {
  if (blockedCardId === blockerCardId) {
    throw new MartrelloError('INVALID_INPUT', 'Um card não pode depender de si mesmo');
  }
  const blocked = await loadCardOrThrow(db, blockedCardId);
  const blocker = await loadCardOrThrow(db, blockerCardId);
  if (blocked.projectId !== blocker.projectId) {
    throw new MartrelloError('CROSS_PROJECT_DEPENDENCY', 'Dependências só podem ser criadas entre cards do mesmo projeto');
  }
  if (await wouldCreateCycle(db, blockedCardId, blockerCardId)) {
    throw new MartrelloError('CYCLE_DETECTED', 'Essa dependência criaria um ciclo');
  }
  await db.insert(cardDependencies).values({ blockedCardId, blockerCardId, createdAt: Date.now() }).onConflictDoNothing();
  return (await db
    .select()
    .from(cardDependencies)
    .where(and(eq(cardDependencies.blockedCardId, blockedCardId), eq(cardDependencies.blockerCardId, blockerCardId))))[0];
}

export async function removeDependency(db: Db, blockedCardId: string, blockerCardId: string): Promise<void> {
  await db
    .delete(cardDependencies)
    .where(and(eq(cardDependencies.blockedCardId, blockedCardId), eq(cardDependencies.blockerCardId, blockerCardId)));
}

export async function getBlockedStatuses(db: Db, cardIds: string[]): Promise<Map<string, BlockedStatus>> {
  const result = new Map<string, BlockedStatus>(cardIds.map((id) => [id, { isBlocked: false, dependsOn: [] }]));
  if (cardIds.length === 0) return result;

  const depRows = await db.select().from(cardDependencies).where(inArray(cardDependencies.blockedCardId, cardIds));
  if (depRows.length === 0) return result;

  const blockerIds = [...new Set(depRows.map((r) => r.blockerCardId))];
  const blockerCards = await db.select().from(cards).where(inArray(cards.id, blockerIds));
  const blockerById = new Map(blockerCards.map((c) => [c.id, c]));

  const projectIds = [...new Set(blockerCards.map((c) => c.projectId))];
  const listRows = projectIds.length ? await db.select().from(lists).where(inArray(lists.projectId, projectIds)) : [];
  const lastListIdByProject = new Map<string, string>();
  const lastPosByProject = new Map<string, number>();
  for (const l of listRows) {
    const cur = lastPosByProject.get(l.projectId) ?? -Infinity;
    if (l.position > cur) {
      lastPosByProject.set(l.projectId, l.position);
      lastListIdByProject.set(l.projectId, l.id);
    }
  }

  for (const cardId of cardIds) {
    const deps = depRows.filter((d) => d.blockedCardId === cardId);
    if (deps.length === 0) continue;
    const dependsOn: DependencyInfo[] = deps.map((d) => {
      const blocker = blockerById.get(d.blockerCardId);
      if (!blocker) return { id: d.blockerCardId, title: '(removido)', isDone: true };
      const isDone = blocker.archivedAt != null || blocker.listId === lastListIdByProject.get(blocker.projectId);
      return { id: blocker.id, title: blocker.title, isDone };
    });
    result.set(cardId, { isBlocked: dependsOn.some((d) => !d.isDone), dependsOn });
  }
  return result;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run:
```bash
pnpm vitest run lib/core/dependencies.test.ts
```
Expected: all tests in the file PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/core/dependencies.ts lib/core/dependencies.test.ts
git commit -m "feat(core): add dependency graph — add/remove edges, compute blocked status"
```

---

### Task 3: Wire blocked status into every card read path

**Files:**
- Modify: `lib/core/cards.ts:65-74` (`getCardById`)
- Modify: `lib/core/cards.test.ts`
- Modify: `lib/core/sprint.ts:9-58` (`SprintCard` type + `loadSprintCards`)
- Modify: `lib/core/sprint.test.ts`
- Modify: `app/project/[id]/page.tsx`
- Modify: `app/sprint/page.tsx`
- Modify: `components/Card.tsx:1-16` (`CardData` type only, in this task)

**Interfaces:**
- Consumes: `getBlockedStatuses` from `./dependencies` (Task 2).
- Produces: `CardData.isBlocked: boolean` (required field) — consumed by
  Task 4. `getCardById(...)` return type gains `isBlocked` and `dependsOn`.
  `SprintCard` gains `isBlocked: boolean`.

- [ ] **Step 1: Add `isBlocked` to `CardData` (compile-time guardrail)**

Edit `components/Card.tsx`, the `CardData` type at the top of the file:

```ts
export type CardData = {
  id: string;
  title: string;
  dueDate: string | null;
  labels: Array<{ name: string; color: string }>;
  projectName?: string;
  projectColor?: string;
  isBlocked: boolean;
};
```

Making it required (not optional) means TypeScript will now fail the build
everywhere a `CardData` is constructed without it — that's `app/project/[id]/page.tsx`
and `app/sprint/page.tsx`, both fixed later in this task. Don't run
`tsc`/`next build` yet; the failures are expected until Steps 4 and 6.

- [ ] **Step 2: Write the failing test for `getCardById`**

Edit `lib/core/cards.test.ts`. Add this import at the top alongside the
existing ones: `import { addDependency } from './dependencies';`. Then add
this test inside the `describe('cards', ...)` block:

```ts
  it('getCardById reports isBlocked and dependsOn', async () => {
    const { p } = await setup();
    const a = await createCard(db, { project: p.id, title: 'a' });
    const b = await createCard(db, { project: p.id, title: 'b' });
    await addDependency(db, b.id, a.id);
    const card = await getCardById(db, b.id);
    expect(card.isBlocked).toBe(true);
    expect(card.dependsOn).toEqual([{ id: a.id, title: 'a', isDone: false }]);
    close();
  });
```

- [ ] **Step 3: Run it to verify it fails**

Run:
```bash
pnpm vitest run lib/core/cards.test.ts -t "reports isBlocked"
```
Expected: FAIL — `card.isBlocked` is `undefined`.

- [ ] **Step 4: Wire `getBlockedStatuses` into `getCardById`**

Edit `lib/core/cards.ts`. Add the import at the top:

```ts
import { getBlockedStatuses, type DependencyInfo } from './dependencies';
```

Replace the `getCardById` function (currently lines 65-74) with:

```ts
export async function getCardById(db: Db, id: string): Promise<Card & { labels: Label[]; isBlocked: boolean; dependsOn: DependencyInfo[] }> {
  const card = (await db.select().from(cards).where(eq(cards.id, id)))[0];
  if (!card) throw new MartrelloError('CARD_NOT_FOUND', `Card ${id} não existe`);
  const labelRows = await db
    .select({ l: labels })
    .from(cardLabels)
    .innerJoin(labels, eq(cardLabels.labelId, labels.id))
    .where(eq(cardLabels.cardId, id));
  const status = (await getBlockedStatuses(db, [id])).get(id)!;
  return { ...card, labels: labelRows.map((r) => r.l), ...status };
}
```

- [ ] **Step 5: Run it to verify it passes**

Run:
```bash
pnpm vitest run lib/core/cards.test.ts
```
Expected: the whole file PASSes, including the new test.

- [ ] **Step 6: Write the failing test for sprint cards**

Edit `lib/core/sprint.test.ts`. Add `import { addDependency } from './dependencies';`
near the top, and add this test inside `describe('sprint', ...)`:

```ts
  it('sprint cards report isBlocked', async () => {
    const c1 = await makeCard();
    const c2 = await makeCard();
    const { addDependency } = await import('./dependencies');
    await addDependency(db, c2.id, c1.id);
    await startSprint(db);
    await addToSprint(db, c1.id);
    await addToSprint(db, c2.id);
    const active = await getActiveSprint(db);
    const card2 = active!.cards.find((c) => c.id === c2.id)!;
    expect(card2.isBlocked).toBe(true);
    close();
  });
```

(Using the dynamic `await import('./dependencies')` matches this test file's
existing style of inline-importing schema/helpers mid-test, as seen in
`lib/core/cards.test.ts`'s `archive removes sprint slot` test — either static
or dynamic import works; keep it dynamic here for consistency with this
file's neighbors, or hoist it to a static top-level import, your call.)

- [ ] **Step 7: Run it to verify it fails**

Run:
```bash
pnpm vitest run lib/core/sprint.test.ts -t "isBlocked"
```
Expected: FAIL — `card2.isBlocked` is `undefined`.

- [ ] **Step 8: Wire `getBlockedStatuses` into `loadSprintCards`**

Edit `lib/core/sprint.ts`. Add the import:

```ts
import { getBlockedStatuses } from './dependencies';
```

Update the `SprintCard` type (currently lines 9-19) to add the field:

```ts
export type SprintCard = {
  id: string;
  title: string;
  projectId: string;
  projectName: string;
  projectColor: string;
  sprintList: SprintList;
  position: number;
  dueDate: string | null;
  labels: Array<{ name: string; color: string }>;
  isBlocked: boolean;
};
```

Replace the body of `loadSprintCards` (currently lines 25-58) with:

```ts
async function loadSprintCards(db: Db, sprintId: string): Promise<SprintCard[]> {
  const rows = await db
    .select({
      slot: sprintSlots,
      card: cards,
      project: projects,
    })
    .from(sprintSlots)
    .innerJoin(cards, eq(sprintSlots.cardId, cards.id))
    .innerJoin(projects, eq(cards.projectId, projects.id))
    .where(eq(sprintSlots.sprintId, sprintId))
    .orderBy(asc(sprintSlots.position));

  const statuses = await getBlockedStatuses(db, rows.map((r) => r.card.id));

  const out: SprintCard[] = [];
  for (const r of rows) {
    const lrows = await db
      .select({ l: labels })
      .from(cardLabels)
      .innerJoin(labels, eq(cardLabels.labelId, labels.id))
      .where(eq(cardLabels.cardId, r.card.id));
    out.push({
      id: r.card.id,
      title: r.card.title,
      projectId: r.project.id,
      projectName: r.project.name,
      projectColor: r.project.color,
      sprintList: r.slot.sprintList,
      position: r.slot.position,
      dueDate: r.card.dueDate,
      labels: lrows.map((x) => ({ name: x.l.name, color: x.l.color })),
      isBlocked: statuses.get(r.card.id)?.isBlocked ?? false,
    });
  }
  return out;
}
```

- [ ] **Step 9: Run it to verify it passes**

Run:
```bash
pnpm vitest run lib/core/sprint.test.ts
```
Expected: the whole file PASSes.

- [ ] **Step 10: Wire it into the board page**

Edit `app/project/[id]/page.tsx`. Add the import:

```ts
import { getBlockedStatuses } from '@/lib/core/dependencies';
```

Right after the `labelsByCard` map is built (after the `for (const r of
labelRows)` loop, before `const totalCards = cardRows.length;`), add:

```ts
  const statuses = await getBlockedStatuses(db, cardRows.map((c) => c.id));
```

Then update the `CardData` construction inside the `columns` map (currently
the `cardRows.filter(...).map<CardData>((c) => ({...}))` block) to include
the new field:

```ts
    cards: cardRows.filter((c) => c.listId === list.id).map<CardData>((c) => ({
      id: c.id,
      title: c.title,
      dueDate: c.dueDate,
      labels: labelsByCard.get(c.id) ?? [],
      isBlocked: statuses.get(c.id)?.isBlocked ?? false,
    })),
```

- [ ] **Step 11: Wire it into the sprint page**

Edit `app/sprint/page.tsx`. Inside the `for (const c of sprint.cards)` loop,
add `isBlocked: c.isBlocked` to the pushed object:

```ts
  for (const c of sprint.cards) {
    groups[c.sprintList].push({
      id: c.id,
      title: c.title,
      dueDate: c.dueDate,
      labels: c.labels,
      projectName: c.projectName,
      projectColor: c.projectColor,
      isBlocked: c.isBlocked,
    });
  }
```

- [ ] **Step 12: Typecheck the whole project**

Run:
```bash
pnpm exec tsc --noEmit
```
Expected: no errors. (This is the check that confirms Step 1's "required
field" guardrail is now satisfied everywhere.)

- [ ] **Step 13: Commit**

```bash
git add lib/core/cards.ts lib/core/cards.test.ts lib/core/sprint.ts lib/core/sprint.test.ts app/project/[id]/page.tsx app/sprint/page.tsx components/Card.tsx
git commit -m "feat(core): surface isBlocked/dependsOn on every card read path"
```

---

### Task 4: Visual indicator on `Card.tsx`

**Files:**
- Modify: `components/Card.tsx`

**Interfaces:**
- Consumes: `CardData.isBlocked` (added in Task 3).
- No new exports — this is a leaf UI change, verified manually in the
  browser (see Global Constraints — no `.tsx` test setup in this repo).

- [ ] **Step 1: Add a `LockIcon`, alongside the existing `CalendarIcon`**

Edit `components/Card.tsx`. Right after the `CalendarIcon` function
definition, add:

```tsx
function LockIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="10"
      height="10"
      viewBox="0 0 12 12"
      fill="none"
      aria-hidden="true"
    >
      <rect x="2.5" y="5.5" width="7" height="5" rx="1" stroke="currentColor" strokeWidth="1.2" />
      <path d="M4 5.5V3.8a2 2 0 1 1 4 0V5.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}
```

- [ ] **Step 2: Override the accent color and background opacity when blocked**

In the `Card` component body, replace:

```tsx
  const primaryLabel = card.labels[0];
  const accent = primaryLabel?.color;
  const isSprint = variant === 'sprint';

  const bg = isSprint
    ? 'bg-[var(--color-mt-sprint-card)] hover:bg-[var(--color-mt-sprint-card-hover)]'
    : 'bg-[var(--color-mt-card)] hover:bg-[var(--color-mt-card-hover)]';
```

with:

```tsx
  const primaryLabel = card.labels[0];
  const accent = card.isBlocked ? 'var(--color-mt-warning)' : (primaryLabel?.color ?? 'transparent');
  const isSprint = variant === 'sprint';

  const bg = isSprint
    ? 'bg-[var(--color-mt-sprint-card)] hover:bg-[var(--color-mt-sprint-card-hover)]'
    : 'bg-[var(--color-mt-card)] hover:bg-[var(--color-mt-card-hover)]';
  const blockedOpacity = card.isBlocked ? 'opacity-70 hover:opacity-100' : '';
```

- [ ] **Step 3: Apply the opacity class and fix the border color source**

Find the `<button>`'s `className` template literal — it currently interpolates
`${bg}`. Add `${blockedOpacity}` right after it:

```tsx
      className={`
        card-btn
        w-full text-left rounded-[var(--radius-sm)]
        ${bg}
        ${blockedOpacity}
        px-2.5 py-2
        ...
```

And update the inline style (currently `style={{ borderLeftColor: accent ??
'transparent' }}`) to just:

```tsx
      style={{ borderLeftColor: accent }}
```

(`accent` is no longer possibly `undefined` after Step 2's change, since the
fallback is baked into its computation.)

- [ ] **Step 4: Show the lock icon next to the title**

Find the title `<p>` block:

```tsx
      <p className="
        text-[13px] leading-snug
        text-[var(--color-mt-text)]
        font-medium
        group-hover:text-white
        transition-colors duration-[120ms]
        break-words
      ">
        {card.title}
      </p>
```

Replace it with:

```tsx
      <p className="
        text-[13px] leading-snug
        text-[var(--color-mt-text)]
        font-medium
        group-hover:text-white
        transition-colors duration-[120ms]
        break-words
        flex items-center gap-1
      ">
        {card.isBlocked && (
          <LockIcon className="text-[var(--color-mt-warning)] shrink-0" />
        )}
        <span>{card.title}</span>
      </p>
```

- [ ] **Step 5: Manually verify in the browser**

Run:
```bash
pnpm dev
```
Then, in another terminal, use the MCP tools (or the running Claude session)
to create two cards in the same project and link them:
```bash
pnpm vitest run # sanity check nothing broke first
```
Open `http://localhost:3000`, navigate to a project, and confirm a normal
card still renders exactly as before (no visual regression). Blocked-card
rendering gets its full end-to-end check in Task 5 Step 6, once the UI to
create a dependency exists — for now, confirm via a one-off script or the
Vitest suite that `isBlocked: true` produces the lock icon + amber border by
temporarily hardcoding `isBlocked: true` on one card's data in
`app/project/[id]/page.tsx`, refreshing the browser, and then reverting the
hardcode (do not commit the hardcode).

- [ ] **Step 6: Commit**

```bash
git add components/Card.tsx
git commit -m "feat(ui): render blocked cards with amber border and lock icon"
```

---

### Task 5: `CardPanel` — "Depende de" section + Server Actions

**Files:**
- Modify: `app/api/card/[id]/route.ts`
- Modify: `app/actions.ts`
- Modify: `components/CardPanel.tsx`

**Interfaces:**
- Consumes: `addDependency`, `removeDependency` from `@/lib/core/dependencies`
  (Task 2); `getCardById` (now returns `isBlocked`/`dependsOn`, Task 3);
  `searchCards` from `@/lib/core/cards` (existing, used to list candidate
  cards for the picker).
- Produces: `addDependencyAction(cardId: string, blockerCardId: string):
  Promise<void>`, `removeDependencyAction(cardId: string, blockerCardId:
  string): Promise<void>` — Server Actions, no other file consumes them
  besides `CardPanel.tsx`.

- [ ] **Step 1: Return candidate cards from the card API route**

Edit `app/api/card/[id]/route.ts`. Replace its full contents with:

```ts
// app/api/card/[id]/route.ts
import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/client';
import { getCardById, searchCards } from '@/lib/core/cards';
import { listLabels } from '@/lib/core/labels';

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();
  const card = await getCardById(db, id);
  const allLabels = await listLabels(db);
  const projectCards = await searchCards(db, { query: '', project: card.projectId });
  const candidateCards = projectCards
    .filter((c) => c.id !== id)
    .map((c) => ({ id: c.id, title: c.title }));
  return NextResponse.json({ card, allLabels, candidateCards });
}
```

- [ ] **Step 2: Add the two Server Actions**

Edit `app/actions.ts`. Add to the imports:

```ts
import { addDependency, removeDependency } from '@/lib/core/dependencies';
```

And add these two functions at the end of the file:

```ts
export async function addDependencyAction(cardId: string, blockerCardId: string) {
  await addDependency(getDb(), cardId, blockerCardId);
  const card = await getCardById(getDb(), cardId);
  revalidatePath(`/project/${card.projectId}`);
  revalidatePath('/sprint');
}

export async function removeDependencyAction(cardId: string, blockerCardId: string) {
  await removeDependency(getDb(), cardId, blockerCardId);
  const card = await getCardById(getDb(), cardId);
  revalidatePath(`/project/${card.projectId}`);
  revalidatePath('/sprint');
}
```

This needs `getCardById` imported too — update the existing `cards` import
line from:

```ts
import { createCard, updateCard, moveCard, archiveCard } from '@/lib/core/cards';
```

to:

```ts
import { createCard, updateCard, moveCard, archiveCard, getCardById } from '@/lib/core/cards';
```

- [ ] **Step 3: Add the "Depende de" section to `CardPanel`**

Edit `components/CardPanel.tsx`. Update the import line to add the two new
actions:

```ts
import { updateCardAction, toggleLabelAction, archiveCardAction, addToSprintAction, removeFromSprintAction, addDependencyAction, removeDependencyAction } from '@/app/actions';
```

Add `useState` for the error message — it's already imported (`useState,
useTransition` from `'react'`), so just add a new state variable inside the
component body, right after `const [pending, start] = useTransition();`:

```tsx
  const [depError, setDepError] = useState<string | null>(null);
```

After the `const allLabels = ...` line, add:

```tsx
  const dependsOn = card.dependsOn as Array<{ id: string; title: string; isDone: boolean }>;
  const candidateCards = (data.candidateCards ?? []) as Array<{ id: string; title: string }>;
  const linkedIds = new Set(dependsOn.map((d) => d.id));
```

Also widen the inline `card` type annotation (currently `const card = data.card
as {...}`) to include the two new fields — replace:

```tsx
  const card = data.card as { id: string; title: string; description: string | null; dueDate: string | null; labels: Array<{ name: string; color: string }> };
```

with:

```tsx
  const card = data.card as {
    id: string;
    title: string;
    description: string | null;
    dueDate: string | null;
    labels: Array<{ name: string; color: string }>;
    dependsOn: Array<{ id: string; title: string; isDone: boolean }>;
  };
```

Finally, add the new section. Insert it right after the "Labels" `<section>`
block and before the final `<section className="flex flex-col gap-2">`
(the sprint/archive actions section):

```tsx
        <section>
          <div className="text-xs text-[var(--color-mt-muted)] mb-1">Depende de</div>
          {dependsOn.length === 0 ? (
            <p className="text-xs text-[var(--color-mt-muted)]">nenhuma dependência</p>
          ) : (
            <ul className="space-y-1 mb-2">
              {dependsOn.map((d) => (
                <li
                  key={d.id}
                  className="flex items-center justify-between gap-2 text-xs bg-[var(--color-mt-card)] px-2 py-1 rounded"
                >
                  <span className={d.isDone ? 'text-[var(--color-mt-muted)] line-through' : 'text-[var(--color-mt-text)]'}>
                    {d.title}
                  </span>
                  <button
                    type="button"
                    onClick={() => start(async () => { await removeDependencyAction(card.id, d.id); mutate(); })}
                    className="text-[var(--color-mt-danger)] shrink-0"
                  >
                    remover
                  </button>
                </li>
              ))}
            </ul>
          )}
          <select
            value=""
            onChange={(e) => {
              const blockerId = e.target.value;
              if (!blockerId) return;
              setDepError(null);
              start(async () => {
                try {
                  await addDependencyAction(card.id, blockerId);
                  mutate();
                } catch (err) {
                  setDepError(err instanceof Error ? err.message : 'Erro ao adicionar dependência');
                }
              });
            }}
            className="w-full text-xs bg-[var(--color-mt-card)] p-1.5 rounded text-[var(--color-mt-text)]"
          >
            <option value="">+ adicionar pré-requisito...</option>
            {candidateCards
              .filter((c) => !linkedIds.has(c.id))
              .map((c) => (
                <option key={c.id} value={c.id}>{c.title}</option>
              ))}
          </select>
          {depError && <p className="text-xs text-[var(--color-mt-danger)] mt-1">{depError}</p>}
        </section>
```

- [ ] **Step 4: Typecheck**

Run:
```bash
pnpm exec tsc --noEmit
```
Expected: no errors.

- [ ] **Step 5: Run the full test suite**

Run:
```bash
pnpm test
```
Expected: all tests PASS (this catches any regression in the routes/actions
this task touched, even though the new UI itself isn't unit-tested per the
Global Constraints).

- [ ] **Step 6: Manually verify end-to-end in the browser**

Run:
```bash
pnpm dev
```
In the browser at `http://localhost:3000`:
1. Open a project with at least two cards, click one to open its panel.
2. Under "Depende de", pick the other card from the dropdown. Confirm it
   appears in the list, and — back on the board — the dependent card now
   shows the amber border + lock icon.
3. Click "remover" on the dependency. Confirm the lock icon disappears from
   the board.
4. Re-add the dependency, then drag the *blocker* card into "Feito". Confirm
   the *dependent* card's lock icon disappears within ~1s (realtime SSE
   refresh) without a manual page reload.
5. Try to create a dependency that would form a cycle (pick A depends on B,
   then try B depends on A from B's panel). Confirm the dropdown attempt
   surfaces the `CYCLE_DETECTED` error message inline instead of silently
   failing or crashing the panel.

- [ ] **Step 7: Commit**

```bash
git add app/api/card/[id]/route.ts app/actions.ts components/CardPanel.tsx
git commit -m "feat(ui): add dependency management to the card panel"
```

---

### Task 6: MCP tools — `martrello_add_dependency` / `martrello_remove_dependency`

**Files:**
- Create: `mcp/tools/dependencies.ts`
- Modify: `mcp/tools/index.ts`
- Create: `mcp/tools/dependencies.test.ts`

**Interfaces:**
- Consumes: `addDependency`, `removeDependency` from `@/lib/core/dependencies`
  (Task 2).
- Produces: two entries in the `tools` array consumed by `mcp/server.ts` (no
  change needed there — it iterates `tools` generically via `findTool`).

- [ ] **Step 1: Look at an existing MCP tool test for the pattern**

Read `mcp/tools/sprint.test.ts` before writing the new test file — it shows
how this repo tests MCP tool handlers directly (calling `.handler({...})` on
the exported tool objects, against a `makeTestDb()`-backed `getDb()` mock).
Match that exact pattern; don't invent a new one.

- [ ] **Step 2: Write the failing test**

Create `mcp/tools/dependencies.test.ts` (mirror the mocking setup you just
read in `mcp/tools/sprint.test.ts` — replace `sprintTools` with
`dependencyTools` and the sprint-specific setup with two cards in one
project):

```ts
// mcp/tools/dependencies.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeTestDb, type Db } from '@/lib/core/test-helpers';
import { createProject, getProjectByNameOrId } from '@/lib/core/projects';
import { createCard } from '@/lib/core/cards';

let db: Db;
let close: () => void;
beforeEach(() => { const t = makeTestDb(); db = t.db; close = t.close; });

vi.mock('@/lib/db/client', () => ({ getDb: () => db }));

describe('dependency tools', () => {
  it('martrello_add_dependency creates the edge', async () => {
    const { dependencyTools } = await import('./dependencies');
    const p = await createProject(db, { name: 'p' });
    const a = await createCard(db, { project: p.id, title: 'a' });
    const b = await createCard(db, { project: p.id, title: 'b' });
    const tool = dependencyTools.find((t) => t.definition.name === 'martrello_add_dependency')!;
    const result = await tool.handler({ card_id: b.id, blocker_card_id: a.id }) as { blockedCardId: string; blockerCardId: string };
    expect(result.blockedCardId).toBe(b.id);
    expect(result.blockerCardId).toBe(a.id);
    close();
  });

  it('martrello_remove_dependency removes the edge', async () => {
    const { dependencyTools } = await import('./dependencies');
    const p = await createProject(db, { name: 'p' });
    const a = await createCard(db, { project: p.id, title: 'a' });
    const b = await createCard(db, { project: p.id, title: 'b' });
    const addTool = dependencyTools.find((t) => t.definition.name === 'martrello_add_dependency')!;
    const removeTool = dependencyTools.find((t) => t.definition.name === 'martrello_remove_dependency')!;
    await addTool.handler({ card_id: b.id, blocker_card_id: a.id });
    const result = await removeTool.handler({ card_id: b.id, blocker_card_id: a.id });
    expect(result).toEqual({ ok: true });
    close();
  });
});
```

(If `mcp/tools/sprint.test.ts` mocks `@/lib/db/client` differently than shown
above — e.g. a different module path or helper — use whatever it actually
does instead; the point is consistency with that file, not this snippet
verbatim.)

- [ ] **Step 3: Run it to verify it fails**

Run:
```bash
pnpm vitest run mcp/tools/dependencies.test.ts
```
Expected: FAIL — `Cannot find module './dependencies'`.

- [ ] **Step 4: Implement `mcp/tools/dependencies.ts`**

```ts
// mcp/tools/dependencies.ts
import { getDb } from '@/lib/db/client';
import { addDependency, removeDependency } from '@/lib/core/dependencies';
import type { MartrelloTool } from './index';

export const dependencyTools: MartrelloTool[] = [
  {
    definition: {
      name: 'martrello_add_dependency',
      description: 'Marca que um card depende de (é bloqueado por) outro card do mesmo projeto. Rejeita ciclos e dependências entre projetos diferentes.',
      inputSchema: {
        type: 'object',
        required: ['card_id', 'blocker_card_id'],
        properties: {
          card_id: { type: 'string', description: 'card que fica bloqueado' },
          blocker_card_id: { type: 'string', description: 'card pré-requisito' },
        },
      },
    },
    handler: async (input) => addDependency(getDb(), String(input.card_id), String(input.blocker_card_id)),
  },
  {
    definition: {
      name: 'martrello_remove_dependency',
      description: 'Remove uma dependência entre dois cards. Idempotente.',
      inputSchema: {
        type: 'object',
        required: ['card_id', 'blocker_card_id'],
        properties: {
          card_id: { type: 'string' },
          blocker_card_id: { type: 'string' },
        },
      },
    },
    handler: async (input) => {
      await removeDependency(getDb(), String(input.card_id), String(input.blocker_card_id));
      return { ok: true };
    },
  },
];
```

- [ ] **Step 5: Register the new tools**

Edit `mcp/tools/index.ts`. Add the import:

```ts
import { dependencyTools } from './dependencies';
```

And add `...dependencyTools` to the `tools` array:

```ts
export const tools: MartrelloTool[] = [
  ...readTools,
  ...projectTools,
  ...listTools,
  ...labelTools,
  ...cardTools,
  ...sprintTools,
  ...dependencyTools,
];
```

- [ ] **Step 6: Run it to verify it passes**

Run:
```bash
pnpm vitest run mcp/tools/dependencies.test.ts
```
Expected: both tests PASS.

- [ ] **Step 7: Run the full test suite one more time**

Run:
```bash
pnpm test
```
Expected: everything passes — this is the last task, so this is the final
regression check for the whole feature.

- [ ] **Step 8: Rebuild the MCP bundle**

Run:
```bash
pnpm mcp:build
```
Expected: `built mcp/dist/index.js` (this is the file `~/.claude.json`'s
`martrello` MCP server entry points at — restart Claude Code, or the
Claude Code session using it, to pick up the two new tools).

- [ ] **Step 9: Commit**

```bash
git add mcp/tools/dependencies.ts mcp/tools/dependencies.test.ts mcp/tools/index.ts mcp/dist/index.js
git commit -m "feat(mcp): add martrello_add_dependency / martrello_remove_dependency tools"
```
