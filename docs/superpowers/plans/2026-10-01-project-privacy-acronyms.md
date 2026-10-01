# Project Privacy Acronyms Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mask project names in the UI behind a 3-letter acronym by default
(so screenshots don't leak client names), with a single global eye-toggle to
reveal real names for the current browser session, and recolor projects from
a flat gray into a 7-tone green ("Sálvia") palette.

**Architecture:** A new `acronym` column on `projects` (auto-suggested, always
editable, unique) feeds a React Context that's provided once at the root
layout and consumed by the three places a project name renders today
(sidebar list, project page header, sprint card pill). The context holds a
single `revealed: boolean` in memory only — never persisted — so every full
reload starts hidden, matching the privacy goal. The acronym-suggestion
algorithm is a pure function with no DB dependency, fully unit-tested against
the examples the user approved during brainstorming.

**Tech Stack:** Next.js 16 (App Router, Server + Client Components), Drizzle
ORM + better-sqlite3, Vitest, React Context.

**Spec:** [docs/superpowers/specs/2026-10-01-project-privacy-acronyms-design.md](../specs/2026-10-01-project-privacy-acronyms-design.md)

## Global Constraints

- The acronym-suggestion algorithm must reproduce every example confirmed in
  the spec's section 4 table exactly: Nubank→NBK, Berzerk→BZK, Edu-TO→ETO,
  TotalPass→TPS, "Never Say never"→NSN, Aulas DascIA→ADA, Aulas Walter→AWR,
  Aulas Mayk→AMK, Motim→MTM, Villela→VLA, Axivero→AVO.
- The reveal toggle's state lives **only in memory** (React Context) — never
  in localStorage, a cookie, the DB, or a URL param. Every full page reload
  must start with names hidden.
- `PROJECT_COLOR_PALETTE` is exactly the 7 Sálvia hex values from the spec:
  `#8a9a5b`, `#6b8e4e`, `#a3b18a`, `#588157`, `#3a5a40`, `#344e41`, `#9db380`.
- `acronym` must be unique across projects, enforced the same way `name`
  already is (app-level check raising `MartrelloError('NAME_CONFLICT', ...)`
  before any DB write) — this applies whether the acronym was auto-suggested
  or explicitly supplied; there is no separate code path for either case.
- Because `projects` already has 9 rows in the real dev DB, adding `acronym`
  as `NOT NULL UNIQUE` in one migration would fail (every existing row would
  get the same default literal, violating uniqueness immediately). The
  column must be added first without the unique constraint (Task 1),
  backfilled with real per-row values (Task 3), and only then given the
  unique index (Task 4). Tests are unaffected by this split — `makeTestDb()`
  always starts from an empty in-memory DB and runs every migration in
  order, so there's never a populated-table conflict there; the split exists
  solely to not break the real local `martrello.db`.
- MCP tool responses (`martrello_get_project`, `martrello_list_projects`,
  etc.) keep returning the real `name` — nothing in this feature hides
  anything from Claude in chat. Only the 3 web-UI rendering sites mask the
  name by default.

## Review Focus

- **Two different project names whose auto-suggested acronyms collide** —
  `createProject`/`updateProject` must reject the second one with
  `NAME_CONFLICT`, not silently create a duplicate acronym or crash. This
  applies identically whether the colliding acronym came from the
  auto-suggestion algorithm or was typed explicitly — same validation code
  path either way.
- **Very short project names (1-2 characters)** feeding the single-word
  first/middle/last-letter sampling branch — must not throw (no
  out-of-bounds string indexing) and must still return a 3-character result.
- **Case normalization** — an acronym supplied in lowercase via the MCP tool
  (e.g. `"mtm"`) must be stored and compared uppercase, so it collides
  correctly with an existing `"MTM"` instead of silently coexisting as a
  "different" value.
- **Reveal state surviving client-side navigation vs. resetting on a real
  reload** — clicking a project link in the sidebar (a Next.js client-side
  route change, not a reload) must NOT reset `revealed` back to hidden,
  since the Context provider lives above the router in the root layout and
  isn't remounted by in-app navigation; only an actual full page
  reload/new-tab must reset it.
- **Re-running the backfill script** — must be idempotent: a second run must
  change nothing (must not recompute and overwrite an acronym a human
  already customized by hand between runs).

---

### Task 1: Schema (phase A, no unique yet) + acronym-suggestion algorithm

**Files:**
- Modify: `lib/db/schema.ts`
- Create: `lib/core/acronym.ts`
- Create: `lib/core/acronym.test.ts`
- Generate: `lib/db/migrations/000X_*.sql` (via `pnpm db:generate`)

**Interfaces:**
- Produces: `projects.acronym` column (nullable-by-default-literal, NOT a
  unique constraint yet — that comes in Task 4). Produces
  `suggestAcronym(name: string): string`, a pure function with no DB
  dependency, consumed by Task 2.

- [ ] **Step 1: Add the `acronym` column to the schema (no unique yet)**

Edit `lib/db/schema.ts`. Find the `projects` table definition:

```ts
export const projects = sqliteTable('projects', {
  id: text('id').primaryKey(),
  name: text('name').notNull().unique(),
  color: text('color').notNull(),
  position: integer('position').notNull(),
  createdAt: integer('created_at').notNull(),
  archivedAt: integer('archived_at'),
});
```

Replace it with (note: `.unique()` is deliberately NOT added yet — see Task
4 for why):

```ts
export const projects = sqliteTable('projects', {
  id: text('id').primaryKey(),
  name: text('name').notNull().unique(),
  // Added without .unique() here: the real dev DB already has 9 rows, and
  // SQLite can't add a UNIQUE NOT NULL column with a single shared default
  // to a populated table (every row's default would collide). The unique
  // index is added in a second migration (Task 4) after Task 3's backfill
  // gives every row a distinct value.
  acronym: text('acronym').notNull().default(''),
  color: text('color').notNull(),
  position: integer('position').notNull(),
  createdAt: integer('created_at').notNull(),
  archivedAt: integer('archived_at'),
});
```

- [ ] **Step 2: Generate and apply the migration**

Run:
```bash
pnpm db:generate
```
Expected: a new file under `lib/db/migrations/`, e.g. `0002_<name>.sql`,
containing `ALTER TABLE projects ADD COLUMN acronym text DEFAULT '' NOT NULL`
(or equivalent) — no `UNIQUE` keyword in this statement. If drizzle-kit
prompts interactively asking whether this is a new column (not a rename),
answer that it's a new column — the `.default('')` in the schema should let
it proceed without asking for a runtime default value.

Then run:
```bash
pnpm db:migrate
```
Expected output: `migrations applied`.

- [ ] **Step 3: Write the failing tests for the acronym algorithm**

Create `lib/core/acronym.test.ts`:

```ts
// lib/core/acronym.test.ts
import { describe, it, expect } from 'vitest';
import { suggestAcronym } from './acronym';

describe('suggestAcronym', () => {
  it('samples first+middle+last letter for a single word with no separators or camelCase', () => {
    expect(suggestAcronym('Nubank')).toBe('NBK');
    expect(suggestAcronym('Berzerk')).toBe('BZK');
    expect(suggestAcronym('Motim')).toBe('MTM');
    expect(suggestAcronym('Villela')).toBe('VLA');
    expect(suggestAcronym('Axivero')).toBe('AVO');
  });

  it('uses initials of both words + last letter of the whole name for 2-word names (space or hyphen separated)', () => {
    expect(suggestAcronym('Edu-TO')).toBe('ETO');
    expect(suggestAcronym('Aulas Walter')).toBe('AWR');
    expect(suggestAcronym('Aulas Mayk')).toBe('AMK');
  });

  it('does NOT further split an already-2-chunk (space/hyphen separated) name by internal camelCase', () => {
    // "DascIA" has an internal lowercase->uppercase transition (c->I), but
    // because "Aulas DascIA" is already 2 space-separated chunks, that
    // transition must be ignored — the result must stay a 2-word case.
    expect(suggestAcronym('Aulas DascIA')).toBe('ADA');
  });

  it('splits camelCase within a single unspaced/unhyphenated word into 2 words', () => {
    expect(suggestAcronym('TotalPass')).toBe('TPS');
  });

  it('uses the first letter of each of the first 3 words for 3+ word names', () => {
    expect(suggestAcronym('Never Say never')).toBe('NSN');
  });

  it('does not throw and still returns a 3-character result for very short names', () => {
    expect(suggestAcronym('A')).toHaveLength(3);
    expect(suggestAcronym('Ab')).toHaveLength(3);
  });

  it('two different names can legitimately collide on the same suggested acronym (uniqueness is enforced elsewhere, not by this function)', () => {
    // Both are 5 letters, same letter at index 0, 2 (middle), and 4 (last).
    expect(suggestAcronym('Lemon')).toBe('LMN');
    expect(suggestAcronym('Lumon')).toBe('LMN');
  });
});
```

- [ ] **Step 4: Run the tests to verify they fail**

Run:
```bash
pnpm vitest run lib/core/acronym.test.ts
```
Expected: FAIL — `Cannot find module './acronym'` (the file doesn't exist
yet).

- [ ] **Step 5: Implement `lib/core/acronym.ts`**

```ts
// lib/core/acronym.ts

function splitChunks(name: string): string[] {
  return name.split(/[\s\-_]+/).filter(Boolean);
}

function splitCamel(chunk: string): string[] {
  return chunk.split(/(?<=[a-z0-9])(?=[A-Z])/).filter(Boolean);
}

export function suggestAcronym(name: string): string {
  const alnum = name.replace(/[^a-zA-Z0-9]/g, '');
  if (alnum.length === 0) return '???';

  let words = splitChunks(name);
  // Only probe for camelCase word boundaries when there was no explicit
  // space/hyphen/underscore separator at all — a name that's already split
  // into 2+ chunks (e.g. "Aulas DascIA") is never split further, even if
  // one of its chunks happens to contain an internal case transition.
  if (words.length === 1) {
    const camelSplit = splitCamel(words[0]);
    if (camelSplit.length > 1) words = camelSplit;
  }

  if (words.length >= 3) {
    return words.slice(0, 3).map((w) => w[0]).join('').toUpperCase();
  }
  if (words.length === 2) {
    const initials = words.map((w) => w[0]).join('');
    const lastChar = alnum[alnum.length - 1];
    return (initials + lastChar).toUpperCase();
  }

  // Single word: sample the first, middle, and last letter.
  const len = alnum.length;
  const first = alnum[0];
  const mid = alnum[Math.floor((len - 1) / 2)];
  const last = alnum[len - 1];
  return (first + mid + last).toUpperCase();
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run:
```bash
pnpm vitest run lib/core/acronym.test.ts
```
Expected: all tests in the file PASS.

- [ ] **Step 7: Commit**

```bash
git add lib/db/schema.ts lib/db/migrations lib/core/acronym.ts lib/core/acronym.test.ts
git commit -m "feat(schema): add projects.acronym column and suggestion algorithm"
```

---

### Task 2: Wire acronym + green palette into `lib/core/projects.ts` and the MCP tools

**Files:**
- Modify: `lib/core/projects.ts`
- Modify: `lib/core/projects.test.ts`
- Modify: `mcp/tools/projects.ts`

**Interfaces:**
- Consumes: `suggestAcronym` from `./acronym` (Task 1).
- Produces: `PROJECT_COLOR_PALETTE: readonly string[]` (7 entries),
  `createProject(db, { name, color?, acronym?, lists? })` now validates and
  resolves `acronym`, and defaults `color` from the palette instead of a
  flat gray. `updateProject(db, id, { name?, color?, acronym? })` gains
  acronym support with the same uniqueness check. Both are consumed by
  Task 3 (backfill script) and already-existing callers (`app/actions.ts`,
  `mcp/tools/projects.ts`).

- [ ] **Step 1: Write the failing tests**

Edit `lib/core/projects.test.ts`. Add this import alongside the existing
ones: `import { PROJECT_COLOR_PALETTE } from './projects';` (it's exported
from the same module these tests already import `createProject` etc. from —
just widen the existing import line). Then add these tests inside the
`describe('projects', ...)` block:

```ts
  it('auto-suggests an acronym when none provided', async () => {
    const p = await createProject(db, { name: 'Nubank' });
    expect(p.acronym).toBe('NBK');
    close();
  });

  it('accepts an explicit acronym, normalized to uppercase', async () => {
    const p = await createProject(db, { name: 'foo', acronym: 'xyz' });
    expect(p.acronym).toBe('XYZ');
    close();
  });

  it('rejects a duplicate acronym on create, regardless of case', async () => {
    await createProject(db, { name: 'foo', acronym: 'ABC' });
    await expect(createProject(db, { name: 'bar', acronym: 'abc' })).rejects.toThrow(/NAME_CONFLICT/);
    close();
  });

  it('rejects two different names whose auto-suggested acronyms happen to collide', async () => {
    await createProject(db, { name: 'Lemon' });
    await expect(createProject(db, { name: 'Lumon' })).rejects.toThrow(/NAME_CONFLICT/);
    close();
  });

  it('cycles through the green palette by creation order when color is omitted', async () => {
    const a = await createProject(db, { name: 'a' });
    const b = await createProject(db, { name: 'b' });
    expect(a.color).toBe(PROJECT_COLOR_PALETTE[0]);
    expect(b.color).toBe(PROJECT_COLOR_PALETTE[1]);
    close();
  });

  it('updateProject can change the acronym, rejecting duplicates case-insensitively', async () => {
    const a = await createProject(db, { name: 'a', acronym: 'AAA' });
    const b = await createProject(db, { name: 'b', acronym: 'BBB' });
    const updated = await updateProject(db, a.id, { acronym: 'ccc' });
    expect(updated.acronym).toBe('CCC');
    await expect(updateProject(db, b.id, { acronym: 'CCC' })).rejects.toThrow(/NAME_CONFLICT/);
    close();
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run:
```bash
pnpm vitest run lib/core/projects.test.ts
```
Expected: FAIL — `p.acronym` is `''` (the column default), not `'NBK'`; the
palette-cycling test fails because `color` still defaults to the old flat
gray; `PROJECT_COLOR_PALETTE` import fails because it doesn't exist yet.

- [ ] **Step 3: Implement the changes in `lib/core/projects.ts`**

Add the import at the top:
```ts
import { suggestAcronym } from './acronym';
```

Replace the `DEFAULT_COLOR` constant (it has no other callers in the
codebase — safe to remove entirely) with the palette:
```ts
export const PROJECT_COLOR_PALETTE = [
  '#8a9a5b', '#6b8e4e', '#a3b18a', '#588157',
  '#3a5a40', '#344e41', '#9db380',
] as const;
```

Replace the full `createProject` function with:

```ts
export async function createProject(
  db: Db,
  input: { name: string; color?: string; acronym?: string; lists?: string[] },
): Promise<Project> {
  const existing = await db.select().from(projects).where(eq(projects.name, input.name));
  if (existing.length > 0) {
    throw new MartrelloError('NAME_CONFLICT', `Já existe projeto chamado '${input.name}'`);
  }

  const acronym = (input.acronym ?? suggestAcronym(input.name)).toUpperCase();
  const acronymConflict = await db.select().from(projects).where(eq(projects.acronym, acronym));
  if (acronymConflict.length > 0) {
    throw new MartrelloError('NAME_CONFLICT', `Já existe projeto com o acrônimo '${acronym}'`);
  }

  const maxPos = (await db.select({ m: max(projects.position) }).from(projects))[0]?.m ?? 0;
  const totalCount = (await db.select({ c: count() }).from(projects))[0]?.c ?? 0;
  const color = input.color ?? PROJECT_COLOR_PALETTE[Number(totalCount) % PROJECT_COLOR_PALETTE.length];
  const id = ulid();
  const now = Date.now();
  const listNames = input.lists?.length ? input.lists : [...DEFAULT_LISTS];

  db.transaction((tx) => {
    tx.insert(projects).values({
      id,
      name: input.name,
      acronym,
      color,
      position: maxPos + POSITION_STEP,
      createdAt: now,
    }).run();
    for (let i = 0; i < listNames.length; i++) {
      tx.insert(lists).values({
        id: ulid(),
        projectId: id,
        name: listNames[i],
        position: POSITION_STEP * (i + 1),
        createdAt: now,
      }).run();
    }
  });

  const row = (await db.select().from(projects).where(eq(projects.id, id)))[0];
  return row;
}
```

Replace the full `updateProject` function with:

```ts
export async function updateProject(
  db: Db,
  id: string,
  patch: { name?: string; color?: string; acronym?: string },
): Promise<Project> {
  if (patch.name) {
    const conflict = await db
      .select()
      .from(projects)
      .where(and(eq(projects.name, patch.name), sql`${projects.id} != ${id}`));
    if (conflict.length > 0) {
      throw new MartrelloError('NAME_CONFLICT', `Já existe projeto '${patch.name}'`);
    }
  }

  const normalizedPatch: { name?: string; color?: string; acronym?: string } = { ...patch };
  if (patch.acronym) {
    normalizedPatch.acronym = patch.acronym.toUpperCase();
    const conflict = await db
      .select()
      .from(projects)
      .where(and(eq(projects.acronym, normalizedPatch.acronym), sql`${projects.id} != ${id}`));
    if (conflict.length > 0) {
      throw new MartrelloError('NAME_CONFLICT', `Já existe projeto com o acrônimo '${normalizedPatch.acronym}'`);
    }
  }

  await db.update(projects).set(normalizedPatch).where(eq(projects.id, id));

  const row = (await db.select().from(projects).where(eq(projects.id, id)))[0];
  if (!row) throw new MartrelloError('PROJECT_NOT_FOUND', `Projeto ${id} não existe`);
  return row;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run:
```bash
pnpm vitest run lib/core/projects.test.ts
```
Expected: the whole file PASSes.

- [ ] **Step 5: Wire `acronym` into the MCP tools**

Edit `mcp/tools/projects.ts`. In the `martrello_create_project` tool's
`inputSchema.properties`, add:
```ts
          acronym: { type: 'string', description: '3 letras; auto-sugerido se omitido' },
```
(right after `name`, before `color`). And update its `handler` to pass it
through:
```ts
    handler: async (input) => createProject(getDb(), {
      name: String(input.name),
      acronym: input.acronym as string | undefined,
      color: input.color as string | undefined,
      lists: input.lists as string[] | undefined,
    }),
```

Update the `martrello_update_project` tool's description to
`'Atualiza nome, cor e/ou acrônimo de um projeto.'`, add to its
`inputSchema.properties`:
```ts
          acronym: { type: 'string' },
```
and update its `handler`:
```ts
    handler: async (input) => {
      const db = getDb();
      const p = await getProjectByNameOrId(db, String(input.project));
      return updateProject(db, p.id, {
        name: input.name as string | undefined,
        color: input.color as string | undefined,
        acronym: input.acronym as string | undefined,
      });
    },
```

- [ ] **Step 6: Typecheck and run the full suite**

Run:
```bash
pnpm exec tsc --noEmit
pnpm test
```
Expected: no type errors; all tests pass.

- [ ] **Step 7: Rebuild the MCP bundle**

Run:
```bash
pnpm mcp:build
```
Expected: `built mcp/dist/index.js`. Per this repo's established convention
(see git history — `mcp/dist/` is gitignored and has never been committed),
do NOT `git add` this file.

- [ ] **Step 8: Commit**

```bash
git add lib/core/projects.ts lib/core/projects.test.ts mcp/tools/projects.ts
git commit -m "feat(core): auto-suggest + validate project acronym, green color palette"
```

---

### Task 3: Backfill the 8 existing projects

**Files:**
- Create: `scripts/backfill-acronyms.ts`

**Interfaces:**
- Consumes: `listProjects`, `updateProject`, `PROJECT_COLOR_PALETTE` from
  `@/lib/core/projects` (Task 2); `getDb`, `closeDb` from `@/lib/db/client`.
- Produces: nothing new for later tasks — this is a one-off operational
  script, run once against the real dev DB, following the exact pattern of
  `scripts/seed.ts`.

- [ ] **Step 1: Write the backfill script**

Create `scripts/backfill-acronyms.ts`:

```ts
// scripts/backfill-acronyms.ts
import { getDb, closeDb } from '@/lib/db/client';
import { listProjects, updateProject, PROJECT_COLOR_PALETTE } from '@/lib/core/projects';
import { suggestAcronym } from '@/lib/core/acronym';

async function main() {
  const db = getDb();
  const all = await listProjects(db, { includeArchived: true });

  let colorIndex = 0;
  for (const p of all) {
    const patch: { acronym?: string; color?: string } = {};

    if (!p.acronym) {
      patch.acronym = suggestAcronym(p.name);
    }

    patch.color = PROJECT_COLOR_PALETTE[colorIndex % PROJECT_COLOR_PALETTE.length];
    colorIndex += 1;

    if (Object.keys(patch).length > 0) {
      await updateProject(db, p.id, patch);
      console.log(`~ ${p.name}: acronym=${patch.acronym ?? '(mantido: ' + p.acronym + ')'}, color=${patch.color}`);
    }
  }

  closeDb();
  console.log('backfill concluído');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

This is idempotent for the acronym field (only computes a new one when
`p.acronym` is falsy — i.e. still the migration's `''` default; a
previously-backfilled or manually-edited row is left alone on a second run).
The color re-assignment always re-runs by design — it's a one-time visual
reset for the "every project is the same flat gray today" problem, not
something a human is expected to have customized yet. If this script is run
a second time, it will simply re-apply the same palette in the same
creation order, producing identical colors (also idempotent in practice).

- [ ] **Step 2: Run it against the real dev DB**

Run:
```bash
pnpm exec tsx scripts/backfill-acronyms.ts
```
Expected output: one `~ <name>: acronym=..., color=...` line per project
(8 total: Motim, Villela, Nubank, Edu-TO, Aulas DascIA, Aulas Walter,
Aulas Mayk, Axivero), followed by `backfill concluído`. Confirm the acronyms
printed match the spec's table (MTM, VLA, NBK, ETO, ADA, AWR, AMK, AVO) —
if any differ, stop and re-check Task 1's `suggestAcronym` implementation
before continuing; do not hand-fix via SQL.

- [ ] **Step 3: Verify idempotency by running it again**

Run:
```bash
pnpm exec tsx scripts/backfill-acronyms.ts
```
Expected: the same 8 lines print again (acronyms unchanged since none are
falsy anymore; colors re-applied identically since the creation order and
palette haven't changed) — confirming a second run is harmless.

- [ ] **Step 4: Spot-check the real DB**

Run:
```bash
sqlite3 martrello.db "SELECT name, acronym, color FROM projects ORDER BY position;"
```
Expected: 8 distinct, non-empty `acronym` values (no blank strings left),
matching the spec's table, each with a color from the Sálvia palette.

- [ ] **Step 5: Commit**

```bash
git add scripts/backfill-acronyms.ts
git commit -m "feat: add one-off backfill script for project acronyms and colors"
```

---

### Task 4: Schema (phase B) — add the unique index now that every row is distinct

**Files:**
- Modify: `lib/db/schema.ts`
- Generate: `lib/db/migrations/000X_*.sql` (via `pnpm db:generate`)

**Interfaces:**
- No new exports — this task only tightens a DB constraint that the app
  layer (Task 2) already enforces logically. After this task, both layers
  agree.

- [ ] **Step 1: Add `.unique()` to the acronym column**

Edit `lib/db/schema.ts`. Change:
```ts
  acronym: text('acronym').notNull().default(''),
```
to:
```ts
  acronym: text('acronym').notNull().unique().default(''),
```

- [ ] **Step 2: Generate and apply the migration**

Run:
```bash
pnpm db:generate
```
Expected: a new migration file containing a
`CREATE UNIQUE INDEX ... ON projects (acronym)` statement (or equivalent).
This must succeed without error — if it fails with a uniqueness violation,
Task 3's backfill did not actually leave every row distinct; stop and
re-check Task 3 before re-running this step (do not work around it by
hand-editing the generated SQL).

Then run:
```bash
pnpm db:migrate
```
Expected output: `migrations applied`.

- [ ] **Step 3: Run the full test suite**

Run:
```bash
pnpm test
```
Expected: all tests still pass (this migration only adds an index; it
doesn't change any behavior the existing tests exercise, since
`makeTestDb()` always starts from zero rows).

- [ ] **Step 4: Commit**

```bash
git add lib/db/schema.ts lib/db/migrations
git commit -m "feat(schema): enforce project acronym uniqueness at the DB level"
```

---

### Task 5: Reveal-toggle Context + sidebar button

**Files:**
- Create: `components/ProjectPrivacyContext.tsx`
- Modify: `app/layout.tsx`
- Modify: `components/SidebarClient.tsx`

**Interfaces:**
- Produces: `ProjectPrivacyProvider` (client component wrapping
  `children`), `useProjectPrivacy(): { revealed: boolean; toggle: () => void }`
  hook — consumed by Task 6's three rendering sites.

- [ ] **Step 1: Create the Context + Provider + hook**

Create `components/ProjectPrivacyContext.tsx`:

```tsx
'use client';
// components/ProjectPrivacyContext.tsx
import { createContext, useContext, useMemo, useState } from 'react';

type ProjectPrivacy = { revealed: boolean; toggle: () => void };

const ProjectPrivacyContext = createContext<ProjectPrivacy | null>(null);

export function ProjectPrivacyProvider({ children }: { children: React.ReactNode }) {
  // In-memory only, intentionally not persisted anywhere (localStorage,
  // cookie, URL, DB) — every full page reload must start hidden.
  const [revealed, setRevealed] = useState(false);
  const value = useMemo(
    () => ({ revealed, toggle: () => setRevealed((r) => !r) }),
    [revealed],
  );
  return (
    <ProjectPrivacyContext.Provider value={value}>
      {children}
    </ProjectPrivacyContext.Provider>
  );
}

export function useProjectPrivacy(): ProjectPrivacy {
  const ctx = useContext(ProjectPrivacyContext);
  if (!ctx) throw new Error('useProjectPrivacy must be used within ProjectPrivacyProvider');
  return ctx;
}
```

- [ ] **Step 2: Provide it at the root layout**

Edit `app/layout.tsx`. Add the import:
```ts
import { ProjectPrivacyProvider } from '@/components/ProjectPrivacyContext';
```

Wrap `<Sidebar />` and the `<main>` element (everything that needs access to
the hook) in the provider — replace:

```tsx
      <body className="min-h-dvh flex overflow-hidden">
        {/* a11y: skip to main content */}
        <a href="#main-content" className="skip-link">
          Pular para conteúdo principal
        </a>
        <Sidebar />
        <main id="main-content" className="flex-1 min-w-0">
          {children}
        </main>
      </body>
```

with:

```tsx
      <body className="min-h-dvh flex overflow-hidden">
        {/* a11y: skip to main content */}
        <a href="#main-content" className="skip-link">
          Pular para conteúdo principal
        </a>
        <ProjectPrivacyProvider>
          <Sidebar />
          <main id="main-content" className="flex-1 min-w-0">
            {children}
          </main>
        </ProjectPrivacyProvider>
      </body>
```

- [ ] **Step 3: Add the eye toggle button to the sidebar**

Edit `components/SidebarClient.tsx`. Add the import:
```ts
import { useProjectPrivacy } from './ProjectPrivacyContext';
```

Add an `EyeIcon` function near the other icon components (right after
`CloseIcon`):

```tsx
function EyeIcon({ open, className }: { open: boolean; className?: string }) {
  return (
    <svg className={className} width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M1 8s2.5-5 7-5 7 5 7 5-2.5 5-7 5-7-5-7-5z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
      <circle cx="8" cy="8" r="2" stroke="currentColor" strokeWidth="1.3" />
      {!open && <path d="M2 2l12 12" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />}
    </svg>
  );
}
```

In the `SidebarClient` function body, right after
`const pathname = usePathname();`, add:
```tsx
  const { revealed, toggle } = useProjectPrivacy();
```

In the "Brand header" block, find:
```tsx
        <div className="
          px-4 py-3 flex items-center justify-between
          border-b border-[var(--color-mt-line-subtle)]
        ">
          <span className="
            text-[13px] font-semibold tracking-tight
            text-[var(--color-mt-text)]
            select-none
          ">
            <span className="text-[var(--color-mt-accent)]">mar</span>trello
          </span>
          {/* Mobile close */}
```

Replace it with (adds the eye button between the brand name and the mobile
close button):

```tsx
        <div className="
          px-4 py-3 flex items-center justify-between
          border-b border-[var(--color-mt-line-subtle)]
        ">
          <span className="
            text-[13px] font-semibold tracking-tight
            text-[var(--color-mt-text)]
            select-none
          ">
            <span className="text-[var(--color-mt-accent)]">mar</span>trello
          </span>
          <button
            type="button"
            onClick={toggle}
            aria-pressed={revealed}
            aria-label={revealed ? 'Esconder nomes reais dos projetos' : 'Mostrar nomes reais dos projetos'}
            title={revealed ? 'Esconder nomes reais' : 'Mostrar nomes reais'}
            className="
              w-7 h-7 flex items-center justify-center shrink-0
              rounded text-[var(--color-mt-muted)]
              hover:text-[var(--color-mt-text)] hover:bg-[var(--color-mt-sidebar-hover)]
              transition-colors duration-[120ms]
            "
          >
            <EyeIcon open={revealed} />
          </button>
          {/* Mobile close */}
```

- [ ] **Step 4: Typecheck**

Run:
```bash
pnpm exec tsc --noEmit
```
Expected: no errors (the hook and provider are self-contained and don't yet
change any other component's prop types; Task 6 updates the sidebar's
`Project` type and its one rendering line together as an atomic edit,
since both belong to the same small change).

- [ ] **Step 5: Commit**

```bash
git add components/ProjectPrivacyContext.tsx app/layout.tsx components/SidebarClient.tsx
git commit -m "feat(ui): add project-name reveal toggle (in-memory, resets on reload)"
```

---

### Task 6: Wire acronym + reveal into the 3 rendering sites

**Files:**
- Modify: `components/SidebarClient.tsx`
- Create: `components/ProjectHeaderName.tsx`
- Modify: `app/project/[id]/page.tsx`
- Modify: `lib/core/sprint.ts`
- Modify: `lib/core/sprint.test.ts`
- Modify: `app/sprint/page.tsx`
- Modify: `components/Card.tsx`

**Interfaces:**
- Consumes: `useProjectPrivacy` from `./ProjectPrivacyContext` (Task 5).
- Produces: `CardData.projectAcronym?: string` (parallel to the existing
  `projectName?`/`projectColor?`), `SprintCard.projectAcronym: string`.

- [ ] **Step 1: Sidebar project list — show acronym or real name**

Edit `components/SidebarClient.tsx`. Update the local `Project` type:

```ts
type Project = {
  id: string;
  name: string;
  acronym: string;
  color: string;
  cardCount: number;
};
```

In the `projects.map((p) => { ... })` block, find:
```tsx
                <span className="flex items-center gap-2.5 min-w-0">
                  <ProjectDot color={p.color} />
                  <span className="truncate">{p.name}</span>
                </span>
```
Replace with:
```tsx
                <span className="flex items-center gap-2.5 min-w-0">
                  <ProjectDot color={p.color} />
                  <span className="truncate">{revealed ? p.name : p.acronym}</span>
                </span>
```

(`revealed` is already in scope from Task 5's Step 3 addition.)

- [ ] **Step 2: Project page header — extract a small client component**

Create `components/ProjectHeaderName.tsx`:

```tsx
'use client';
// components/ProjectHeaderName.tsx
import { useProjectPrivacy } from './ProjectPrivacyContext';

export function ProjectHeaderName({ name, acronym }: { name: string; acronym: string }) {
  const { revealed } = useProjectPrivacy();
  return (
    <h1 className="text-[14px] font-semibold text-[var(--color-mt-text)] truncate">
      {revealed ? name : acronym}
    </h1>
  );
}
```

Edit `app/project/[id]/page.tsx`. Add the import:
```ts
import { ProjectHeaderName } from '@/components/ProjectHeaderName';
```

Find, in the header `<header>` block:
```tsx
        <h1 className="text-[14px] font-semibold text-[var(--color-mt-text)] truncate">
          {project.name}
        </h1>
```
Replace with:
```tsx
        <ProjectHeaderName name={project.name} acronym={project.acronym} />
```

- [ ] **Step 3: Write the failing test for sprint card acronyms**

Edit `lib/core/sprint.test.ts`. Add this test inside `describe('sprint',
...)`:

```ts
  it('sprint cards report the project acronym', async () => {
    const p = await createProject(db, { name: 'Nubank' });
    const full = await getProjectByNameOrId(db, p.id);
    const c = await createCard(db, { project: p.id, title: 'x', list: full.lists[0].id });
    await startSprint(db);
    await addToSprint(db, c.id);
    const active = await getActiveSprint(db);
    const card = active!.cards.find((x) => x.id === c.id)!;
    expect(card.projectAcronym).toBe('NBK');
    close();
  });
```

If `createProject`, `getProjectByNameOrId` aren't already imported at the
top of this file, add:
```ts
import { createProject, getProjectByNameOrId } from './projects';
```
(check the existing imports first — this file's `makeCard` helper already
calls `createProject` internally, so one or both may already be imported;
only add what's missing.)

- [ ] **Step 4: Run it to verify it fails**

Run:
```bash
pnpm vitest run lib/core/sprint.test.ts -t "projectAcronym"
```
Expected: FAIL — `card.projectAcronym` is `undefined`.

- [ ] **Step 5: Wire `projectAcronym` into `lib/core/sprint.ts`**

Update the `SprintCard` type:

```ts
export type SprintCard = {
  id: string;
  title: string;
  projectId: string;
  projectName: string;
  projectAcronym: string;
  projectColor: string;
  sprintList: SprintList;
  position: number;
  dueDate: string | null;
  labels: Array<{ name: string; color: string }>;
  isBlocked: boolean;
};
```

In `loadSprintCards`, find the object pushed to `out`:
```ts
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
```
Add `projectAcronym: r.project.acronym,` right after `projectName`:
```ts
    out.push({
      id: r.card.id,
      title: r.card.title,
      projectId: r.project.id,
      projectName: r.project.name,
      projectAcronym: r.project.acronym,
      projectColor: r.project.color,
      sprintList: r.slot.sprintList,
      position: r.slot.position,
      dueDate: r.card.dueDate,
      labels: lrows.map((x) => ({ name: x.l.name, color: x.l.color })),
      isBlocked: statuses.get(r.card.id)?.isBlocked ?? false,
    });
```

- [ ] **Step 6: Run it to verify it passes**

Run:
```bash
pnpm vitest run lib/core/sprint.test.ts
```
Expected: the whole file PASSes.

- [ ] **Step 7: Thread it through the sprint page**

Edit `app/sprint/page.tsx`. In the `for (const c of sprint.cards)` loop,
find:
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
Add `projectAcronym: c.projectAcronym,`:
```ts
  for (const c of sprint.cards) {
    groups[c.sprintList].push({
      id: c.id,
      title: c.title,
      dueDate: c.dueDate,
      labels: c.labels,
      projectName: c.projectName,
      projectAcronym: c.projectAcronym,
      projectColor: c.projectColor,
      isBlocked: c.isBlocked,
    });
  }
```

- [ ] **Step 8: Wire the reveal toggle into `Card.tsx`'s sprint project pill**

Edit `components/Card.tsx`. Add `projectAcronym?: string;` to the `CardData`
type, right after `projectName?: string;`:
```ts
export type CardData = {
  id: string;
  title: string;
  dueDate: string | null;
  labels: Array<{ name: string; color: string }>;
  projectName?: string;
  projectAcronym?: string;
  projectColor?: string;
  isBlocked: boolean;
};
```

Add the import at the top:
```ts
import { useProjectPrivacy } from './ProjectPrivacyContext';
```

In the `Card` function body, right after `const isSprint = variant ===
'sprint';`, add:
```tsx
  const { revealed } = useProjectPrivacy();
```

Find the project pill block:
```tsx
          {/* Sprint: project pill */}
          {isSprint && card.projectName && (
            <span
              className="
                ml-auto mono-badge
                px-1.5 py-0.5 rounded-[3px]
                bg-black/20
                font-medium truncate max-w-[100px]
              "
              style={{ color: card.projectColor ?? 'var(--color-mt-muted-hi)' }}
              title={card.projectName}
            >
              {card.projectName}
            </span>
          )}
```
Replace the inner text (keep everything else, including the
`card.projectName &&` guard and the `title` attribute, which should always
show the real name on hover for accessibility regardless of the toggle)
with:
```tsx
          {/* Sprint: project pill */}
          {isSprint && card.projectName && (
            <span
              className="
                ml-auto mono-badge
                px-1.5 py-0.5 rounded-[3px]
                bg-black/20
                font-medium truncate max-w-[100px]
              "
              style={{ color: card.projectColor ?? 'var(--color-mt-muted-hi)' }}
              title={card.projectName}
            >
              {revealed ? card.projectName : (card.projectAcronym ?? card.projectName)}
            </span>
          )}
```

(The `?? card.projectName` fallback covers the case where `projectAcronym`
is omitted — e.g. if some future caller constructs a `CardData` without it —
so the pill never silently disappears; it just shows the full name instead
of failing.)

- [ ] **Step 9: Typecheck and run the full suite**

Run:
```bash
pnpm exec tsc --noEmit
pnpm test
```
Expected: no type errors; all tests pass.

- [ ] **Step 10: Manually verify in the browser**

Run:
```bash
pnpm dev
```
In the browser at `http://localhost:3000`:
1. Confirm the sidebar shows acronyms (MTM, VLA, NBK, ETO, ADA, AWR, AVO),
   not real names, by default.
2. Click the eye icon at the top of the sidebar. Confirm the sidebar list,
   the project page header (open a project first), and — if there's an
   active sprint with cards from different projects — the sprint board's
   project pills all switch to showing real names simultaneously.
3. Click a project link in the sidebar while still revealed (a client-side
   navigation). Confirm the header of the newly-loaded project page is
   STILL showing the real name (the reveal state must survive in-app
   navigation — Review Focus item).
4. Hard-reload the page (not just a client navigation). Confirm everything
   is back to acronyms-only (the reveal state must NOT survive an actual
   reload — this is the core privacy guarantee).
5. Click the eye icon again to hide, confirm it toggles back correctly.

- [ ] **Step 11: Commit**

```bash
git add components/SidebarClient.tsx components/ProjectHeaderName.tsx app/project/\[id\]/page.tsx lib/core/sprint.ts lib/core/sprint.test.ts app/sprint/page.tsx components/Card.tsx
git commit -m "feat(ui): mask project names behind acronyms in sidebar, board header, and sprint pill"
```
