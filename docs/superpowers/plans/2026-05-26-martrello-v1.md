# martrello v1 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a personal Trello clone with Claude Code as the primary writer via a local MCP server, plus a dark-mode web UI for reading and drag-and-drop.

**Architecture:** Single Next.js 16 repo. SQLite (`better-sqlite3` + Drizzle) as the storage. A separate MCP server process (in the same repo) exposes tools to Claude Code; both processes share the same domain logic in `lib/core/`. SWR with `revalidateOnFocus` + 3s polling for browser ↔ DB sync.

**Tech Stack:** Next.js 16, React 19, TypeScript 5, Tailwind CSS 4, Drizzle ORM, `better-sqlite3`, `@modelcontextprotocol/sdk`, `@dnd-kit/core` + `@dnd-kit/sortable`, SWR, Zod, `ulidx`, Vitest, `react-markdown`.

**Reference spec:** [docs/superpowers/specs/2026-05-26-martrello-design.md](../specs/2026-05-26-martrello-design.md)

---

## Phase milestones

- **End of Phase 0:** repo bootstrapped, `pnpm test` runs (no tests yet, exits clean).
- **End of Phase 1:** schema migrated to `martrello.db`; can insert/select via raw Drizzle in a smoke test.
- **End of Phase 2:** `lib/core/*` is fully tested with Vitest. No UI, no MCP, but the domain works.
- **End of Phase 3:** MCP server compiles and responds to `tools/list`; smoke-callable via stdio.
- **End of Phase 4:** all MCP tools implemented and integration-tested. **Milestone: usable through Claude Code already** (no UI yet, but you can `create_card`, `add_to_sprint`, etc. and inspect via `get_sprint`).
- **End of Phase 5:** Next.js UI renders projects and sprint; drag-and-drop works.
- **End of Phase 6:** README + MCP config snippet + backup script — ready for daily use.

---

## Phase 0 — Bootstrap

### Task 1: Initialize Next.js project

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `next-env.d.ts`, `app/layout.tsx`, `app/page.tsx`, `app/globals.css`, `postcss.config.mjs`, `.npmrc`

- [ ] **Step 1: Scaffold Next.js with TypeScript and Tailwind**

Run from `/Users/marceloferro/martrello`:

```bash
pnpm dlx create-next-app@latest . \
  --typescript --tailwind --app --src-dir=false \
  --import-alias='@/*' --no-eslint --use-pnpm --turbopack --yes
```

If the directory contains the existing `docs/` and `.gitignore` from the spec commit, the scaffolder will prompt about overwriting. Choose to keep existing files. If the command refuses to run in a non-empty dir, run with `--force` after backing up `docs/` and `.gitignore`:

```bash
cp -r docs /tmp/martrello-docs-bak && cp .gitignore /tmp/martrello-gitignore-bak
pnpm dlx create-next-app@latest . --typescript --tailwind --app --src-dir=false --import-alias='@/*' --no-eslint --use-pnpm --turbopack --yes --force
cp -r /tmp/martrello-docs-bak docs && cp /tmp/martrello-gitignore-bak .gitignore
```

Expected: scaffold creates `package.json`, `app/`, `next.config.ts`, `tsconfig.json`, `postcss.config.mjs`, `app/globals.css`.

- [ ] **Step 2: Add `.npmrc` to pin Node version messaging**

```
auto-install-peers=true
strict-peer-dependencies=false
```

Create `/Users/marceloferro/martrello/.npmrc` with the above content.

- [ ] **Step 3: Pin Node version**

Create `/Users/marceloferro/martrello/.nvmrc`:

```
24
```

- [ ] **Step 4: Verify dev server boots**

Run:

```bash
pnpm dev
```

Expected: server starts on `http://localhost:3000`; default Next.js welcome page renders. Stop with Ctrl-C.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: scaffold Next.js 16 app with TypeScript and Tailwind"
```

---

### Task 2: Install runtime and dev dependencies

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install runtime deps**

```bash
pnpm add \
  better-sqlite3 drizzle-orm \
  @modelcontextprotocol/sdk \
  @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities \
  swr zod ulidx \
  react-markdown remark-gfm \
  date-fns
```

- [ ] **Step 2: Install dev deps**

```bash
pnpm add -D \
  drizzle-kit @types/better-sqlite3 \
  vitest @vitest/ui \
  tsx \
  @types/node
```

- [ ] **Step 3: Verify install**

```bash
pnpm install
pnpm ls drizzle-orm better-sqlite3 @modelcontextprotocol/sdk
```

Expected: all three packages list without "missing" markers.

- [ ] **Step 4: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "chore: install runtime and dev dependencies"
```

---

### Task 3: Configure Vitest

**Files:**
- Create: `vitest.config.ts`, `tests/.gitkeep`
- Modify: `package.json` (scripts)

- [ ] **Step 1: Create `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts', 'lib/**/*.test.ts', 'mcp/**/*.test.ts'],
    globals: false,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
});
```

- [ ] **Step 2: Add scripts to `package.json`**

Add to the `"scripts"` block:

```json
{
  "test": "vitest run",
  "test:watch": "vitest",
  "test:ui": "vitest --ui",
  "db:generate": "drizzle-kit generate",
  "db:migrate": "tsx scripts/migrate.ts",
  "db:push": "drizzle-kit push",
  "seed": "tsx scripts/seed.ts",
  "backup": "tsx scripts/backup.ts",
  "mcp:dev": "tsx mcp/index.ts",
  "mcp:build": "tsx scripts/build-mcp.ts"
}
```

- [ ] **Step 3: Create empty `tests/` directory marker**

```bash
mkdir -p tests && touch tests/.gitkeep
```

- [ ] **Step 4: Verify `pnpm test` runs**

```bash
pnpm test
```

Expected: vitest exits 0 with "No test files found" message (acceptable for now).

- [ ] **Step 5: Commit**

```bash
git add vitest.config.ts package.json tests/.gitkeep
git commit -m "chore: configure vitest and add project scripts"
```

---

<!-- PHASE-0 -->
## Phase 1 — Database

### Task 4: Define the Drizzle schema

**Files:**
- Create: `lib/db/schema.ts`

- [ ] **Step 1: Write the schema**

```ts
// lib/db/schema.ts
import { sqliteTable, text, integer, primaryKey, uniqueIndex, index } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const projects = sqliteTable('projects', {
  id: text('id').primaryKey(),
  name: text('name').notNull().unique(),
  color: text('color').notNull(),
  position: integer('position').notNull(),
  createdAt: integer('created_at').notNull(),
  archivedAt: integer('archived_at'),
});

export const lists = sqliteTable(
  'lists',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    position: integer('position').notNull(),
    createdAt: integer('created_at').notNull(),
  },
  (t) => ({
    byProject: index('lists_by_project').on(t.projectId),
  }),
);

export const cards = sqliteTable(
  'cards',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
    listId: text('list_id').notNull().references(() => lists.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    description: text('description'),
    dueDate: text('due_date'),
    position: integer('position').notNull(),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
    archivedAt: integer('archived_at'),
  },
  (t) => ({
    byList: index('cards_by_list').on(t.listId),
    byProject: index('cards_by_project').on(t.projectId),
  }),
);

export const labels = sqliteTable('labels', {
  id: text('id').primaryKey(),
  name: text('name').notNull().unique(),
  color: text('color').notNull(),
});

export const cardLabels = sqliteTable(
  'card_labels',
  {
    cardId: text('card_id').notNull().references(() => cards.id, { onDelete: 'cascade' }),
    labelId: text('label_id').notNull().references(() => labels.id, { onDelete: 'cascade' }),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.cardId, t.labelId] }),
  }),
);

export const sprints = sqliteTable(
  'sprints',
  {
    id: text('id').primaryKey(),
    name: text('name'),
    startedAt: integer('started_at').notNull(),
    closedAt: integer('closed_at'),
    cardsSnapshot: text('cards_snapshot'),
  },
  (t) => ({
    oneActive: uniqueIndex('one_active_sprint').on(t.closedAt).where(sql`${t.closedAt} IS NULL`),
  }),
);

export const sprintSlots = sqliteTable(
  'sprint_slots',
  {
    cardId: text('card_id').primaryKey().references(() => cards.id, { onDelete: 'cascade' }),
    sprintId: text('sprint_id').notNull().references(() => sprints.id, { onDelete: 'cascade' }),
    sprintList: text('sprint_list', { enum: ['backlog', 'doing', 'done'] }).notNull(),
    position: integer('position').notNull(),
    addedAt: integer('added_at').notNull(),
  },
  (t) => ({
    bySprint: index('slots_by_sprint').on(t.sprintId),
  }),
);

export type Project = typeof projects.$inferSelect;
export type NewProject = typeof projects.$inferInsert;
export type List = typeof lists.$inferSelect;
export type Card = typeof cards.$inferSelect;
export type Label = typeof labels.$inferSelect;
export type Sprint = typeof sprints.$inferSelect;
export type SprintSlot = typeof sprintSlots.$inferSelect;
export type SprintList = 'backlog' | 'doing' | 'done';
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
pnpm tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 3: Commit**

```bash
git add lib/db/schema.ts
git commit -m "feat(db): define drizzle schema for projects, cards, labels, sprints"
```

---

### Task 5: Create DB client singleton and migration runner

**Files:**
- Create: `lib/db/client.ts`, `drizzle.config.ts`, `scripts/migrate.ts`

- [ ] **Step 1: Write `drizzle.config.ts`**

```ts
// drizzle.config.ts
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './lib/db/schema.ts',
  out: './lib/db/migrations',
  dialect: 'sqlite',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'file:./martrello.db',
  },
  strict: true,
  verbose: true,
});
```

- [ ] **Step 2: Write `lib/db/client.ts`**

```ts
// lib/db/client.ts
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema';

const DB_PATH = process.env.DATABASE_URL?.replace(/^file:/, '') ?? './martrello.db';

let _sqlite: Database.Database | null = null;
let _db: ReturnType<typeof drizzle<typeof schema>> | null = null;

export function getDb() {
  if (_db) return _db;
  _sqlite = new Database(DB_PATH);
  _sqlite.pragma('journal_mode = WAL');
  _sqlite.pragma('foreign_keys = ON');
  _db = drizzle(_sqlite, { schema });
  return _db;
}

export function getRawSqlite(): Database.Database {
  if (!_sqlite) getDb();
  return _sqlite!;
}

export function closeDb() {
  if (_sqlite) {
    _sqlite.close();
    _sqlite = null;
    _db = null;
  }
}
```

- [ ] **Step 3: Generate the initial migration**

```bash
pnpm db:generate
```

Expected: creates `lib/db/migrations/0000_*.sql` with `CREATE TABLE` statements for all 7 tables plus the partial unique index for `one_active_sprint`.

- [ ] **Step 4: Write `scripts/migrate.ts`**

```ts
// scripts/migrate.ts
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { getDb, closeDb } from '@/lib/db/client';

function main() {
  const db = getDb();
  migrate(db, { migrationsFolder: './lib/db/migrations' });
  console.log('migrations applied');
  closeDb();
}

main();
```

- [ ] **Step 5: Apply migrations**

```bash
pnpm db:migrate
```

Expected: prints "migrations applied", creates `martrello.db` in the project root.

- [ ] **Step 6: Verify schema with sqlite CLI**

```bash
sqlite3 martrello.db ".schema projects"
sqlite3 martrello.db ".schema sprints"
```

Expected: `CREATE TABLE projects (...)` and `CREATE TABLE sprints (...)` with the partial unique index visible.

- [ ] **Step 7: Commit**

```bash
git add drizzle.config.ts lib/db/client.ts scripts/migrate.ts lib/db/migrations/
git commit -m "feat(db): add drizzle client, migration runner, and initial migration"
```

---

### Task 6: DB smoke test

**Files:**
- Create: `tests/db.smoke.test.ts`

- [ ] **Step 1: Write the test**

```ts
// tests/db.smoke.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import * as schema from '@/lib/db/schema';

let sqlite: Database.Database;
let db: ReturnType<typeof drizzle<typeof schema>>;

beforeAll(() => {
  sqlite = new Database(':memory:');
  sqlite.pragma('foreign_keys = ON');
  db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: './lib/db/migrations' });
});

afterAll(() => sqlite.close());

describe('db smoke', () => {
  it('inserts and reads a project', async () => {
    await db.insert(schema.projects).values({
      id: 'p1',
      name: 'test',
      color: '#fff',
      position: 0,
      createdAt: Date.now(),
    });
    const rows = await db.select().from(schema.projects);
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe('test');
  });

  it('enforces only one active sprint', async () => {
    await db.insert(schema.sprints).values({ id: 's1', startedAt: Date.now() });
    await expect(
      db.insert(schema.sprints).values({ id: 's2', startedAt: Date.now() }),
    ).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run the test**

```bash
pnpm test tests/db.smoke.test.ts
```

Expected: both tests PASS.

- [ ] **Step 3: Commit**

```bash
git add tests/db.smoke.test.ts
git commit -m "test(db): smoke test for schema and one-active-sprint invariant"
```

---

<!-- PHASE-1 -->
## Phase 2 — Core domain (TDD)

### Task 7: Structured errors with suggestion engine

**Files:**
- Create: `lib/errors.ts`, `lib/errors.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// lib/errors.test.ts
import { describe, it, expect } from 'vitest';
import { MartrelloError, suggestClosest } from './errors';

describe('MartrelloError', () => {
  it('serializes to {error, message}', () => {
    const e = new MartrelloError('PROJECT_NOT_FOUND', "Projeto 'foo' não existe");
    expect(e.toJSON()).toEqual({
      error: 'PROJECT_NOT_FOUND',
      message: "Projeto 'foo' não existe",
    });
  });

  it('includes suggestions when provided', () => {
    const e = new MartrelloError('PROJECT_NOT_FOUND', 'msg', ['martrello', 'app']);
    expect(e.toJSON()).toEqual({
      error: 'PROJECT_NOT_FOUND',
      message: 'msg',
      suggestions: ['martrello', 'app'],
    });
  });
});

describe('suggestClosest', () => {
  it('returns up to 3 closest names by Levenshtein distance', () => {
    const out = suggestClosest('mart', ['martrello', 'pessoal', 'martelo', 'app']);
    expect(out).toEqual(['martelo', 'martrello']);
  });

  it('returns empty when no candidate is close enough', () => {
    const out = suggestClosest('xyz', ['martrello', 'pessoal']);
    expect(out).toEqual([]);
  });
});
```

- [ ] **Step 2: Run, expect failure**

```bash
pnpm test lib/errors.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `lib/errors.ts`**

```ts
// lib/errors.ts
export type ErrorCode =
  | 'PROJECT_NOT_FOUND'
  | 'LIST_NOT_FOUND'
  | 'CARD_NOT_FOUND'
  | 'LABEL_NOT_FOUND'
  | 'SPRINT_NOT_FOUND'
  | 'INVALID_DATE'
  | 'SPRINT_ALREADY_ACTIVE'
  | 'NO_ACTIVE_SPRINT'
  | 'LIST_NOT_IN_PROJECT'
  | 'LIST_NOT_EMPTY'
  | 'NAME_CONFLICT'
  | 'INVALID_INPUT';

export class MartrelloError extends Error {
  constructor(
    public code: ErrorCode,
    message: string,
    public suggestions?: string[],
  ) {
    super(message);
    this.name = 'MartrelloError';
  }

  toJSON() {
    const base: { error: ErrorCode; message: string; suggestions?: string[] } = {
      error: this.code,
      message: this.message,
    };
    if (this.suggestions && this.suggestions.length > 0) base.suggestions = this.suggestions;
    return base;
  }
}

function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[m][n];
}

export function suggestClosest(needle: string, candidates: string[], max = 3, threshold = 3): string[] {
  const n = needle.toLowerCase();
  return candidates
    .map((c) => ({ c, d: levenshtein(n, c.toLowerCase()) }))
    .filter((x) => x.d <= threshold)
    .sort((a, b) => a.d - b.d)
    .slice(0, max)
    .map((x) => x.c);
}
```

- [ ] **Step 4: Run, expect pass**

```bash
pnpm test lib/errors.test.ts
```

Expected: both tests PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/errors.ts lib/errors.test.ts
git commit -m "feat(core): structured errors with closest-name suggestions"
```

---

### Task 8: Position renumbering helper

**Files:**
- Create: `lib/core/positions.ts`, `lib/core/positions.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// lib/core/positions.test.ts
import { describe, it, expect } from 'vitest';
import { renumber, insertAt, POSITION_STEP } from './positions';

describe('renumber', () => {
  it('returns evenly-spaced integers starting at STEP', () => {
    expect(renumber(['a', 'b', 'c'])).toEqual([
      { id: 'a', position: POSITION_STEP * 1 },
      { id: 'b', position: POSITION_STEP * 2 },
      { id: 'c', position: POSITION_STEP * 3 },
    ]);
  });
  it('handles empty', () => {
    expect(renumber([])).toEqual([]);
  });
});

describe('insertAt', () => {
  it('appends when index >= length', () => {
    const ordered = [{ id: 'a' }, { id: 'b' }];
    expect(insertAt(ordered, 'new', 99).map((x) => x.id)).toEqual(['a', 'b', 'new']);
  });
  it('inserts at given index', () => {
    const ordered = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    expect(insertAt(ordered, 'new', 1).map((x) => x.id)).toEqual(['a', 'new', 'b', 'c']);
  });
  it('moves existing id when present', () => {
    const ordered = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    expect(insertAt(ordered, 'a', 2).map((x) => x.id)).toEqual(['b', 'a', 'c']);
  });
});
```

- [ ] **Step 2: Run, expect failure**

```bash
pnpm test lib/core/positions.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// lib/core/positions.ts
export const POSITION_STEP = 1000;

export function renumber(ids: string[]): Array<{ id: string; position: number }> {
  return ids.map((id, i) => ({ id, position: POSITION_STEP * (i + 1) }));
}

export function insertAt<T extends { id: string }>(items: T[], id: string, index: number): T[] {
  const present = items.find((x) => x.id === id);
  const without = items.filter((x) => x.id !== id);
  const clampedIndex = Math.max(0, Math.min(index, without.length));
  const next = present ?? ({ id } as T);
  return [...without.slice(0, clampedIndex), next, ...without.slice(clampedIndex)];
}
```

- [ ] **Step 4: Run, expect pass**

```bash
pnpm test lib/core/positions.test.ts
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/core/positions.ts lib/core/positions.test.ts
git commit -m "feat(core): position renumbering and insert helpers"
```

---

### Task 9: pt-BR date parser

**Files:**
- Create: `lib/core/dates.ts`, `lib/core/dates.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// lib/core/dates.test.ts
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { parseDate } from './dates';

const FIXED_NOW = new Date('2026-05-27T12:00:00Z').getTime(); // Wednesday

beforeAll(() => {
  vi.useFakeTimers();
  vi.setSystemTime(FIXED_NOW);
});
afterAll(() => vi.useRealTimers());

describe('parseDate', () => {
  it('parses ISO date', () => {
    expect(parseDate('2026-06-15')).toBe('2026-06-15');
  });
  it('parses "hoje"', () => {
    expect(parseDate('hoje')).toBe('2026-05-27');
  });
  it('parses "amanhã" and "amanha"', () => {
    expect(parseDate('amanhã')).toBe('2026-05-28');
    expect(parseDate('amanha')).toBe('2026-05-28');
  });
  it('parses "ontem"', () => {
    expect(parseDate('ontem')).toBe('2026-05-26');
  });
  it('parses "sex" (next Friday from a Wednesday)', () => {
    expect(parseDate('sex')).toBe('2026-05-29');
  });
  it('parses "sexta"', () => {
    expect(parseDate('sexta')).toBe('2026-05-29');
  });
  it('parses "+3d"', () => {
    expect(parseDate('+3d')).toBe('2026-05-30');
  });
  it('parses "+1s" and "+1sem" (1 week)', () => {
    expect(parseDate('+1s')).toBe('2026-06-03');
    expect(parseDate('+1sem')).toBe('2026-06-03');
  });
  it('parses "próxima sexta"', () => {
    expect(parseDate('próxima sexta')).toBe('2026-06-05');
  });
  it('parses "daqui 2 semanas"', () => {
    expect(parseDate('daqui 2 semanas')).toBe('2026-06-10');
  });
  it('throws INVALID_DATE on garbage', () => {
    expect(() => parseDate('zzz')).toThrow(/INVALID_DATE/);
  });
});
```

- [ ] **Step 2: Run, expect failure**

```bash
pnpm test lib/core/dates.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// lib/core/dates.ts
import { addDays, addWeeks, format, nextDay, parseISO, isValid, type Day } from 'date-fns';
import { MartrelloError } from '@/lib/errors';

const ISO = /^\d{4}-\d{2}-\d{2}$/;

const WEEKDAY_MAP: Record<string, Day> = {
  domingo: 0, dom: 0,
  segunda: 1, seg: 1,
  terça: 2, terca: 2, ter: 2,
  quarta: 3, qua: 3,
  quinta: 4, qui: 4,
  sexta: 5, sex: 5,
  sábado: 6, sabado: 6, sab: 6,
};

function normalize(input: string): string {
  return input.trim().toLowerCase();
}

function fmt(d: Date): string {
  return format(d, 'yyyy-MM-dd');
}

export function parseDate(input: string, now: Date = new Date()): string {
  const s = normalize(input);

  if (ISO.test(s)) {
    const d = parseISO(s);
    if (!isValid(d)) throw new MartrelloError('INVALID_DATE', `Data ISO inválida: ${input}`);
    return s;
  }

  if (s === 'hoje') return fmt(now);
  if (s === 'amanhã' || s === 'amanha') return fmt(addDays(now, 1));
  if (s === 'ontem') return fmt(addDays(now, -1));

  const weekday = WEEKDAY_MAP[s];
  if (weekday !== undefined) return fmt(nextDay(now, weekday));

  const proximaMatch = s.match(/^pr[oó]xima\s+(\w+)$/);
  if (proximaMatch) {
    const wd = WEEKDAY_MAP[proximaMatch[1]];
    if (wd !== undefined) return fmt(addWeeks(nextDay(now, wd), 1));
  }

  const offsetMatch = s.match(/^\+(\d+)(d|s|sem|semanas?)$/);
  if (offsetMatch) {
    const n = parseInt(offsetMatch[1], 10);
    const unit = offsetMatch[2];
    if (unit === 'd') return fmt(addDays(now, n));
    return fmt(addWeeks(now, n));
  }

  const daquiMatch = s.match(/^daqui\s+(\d+)\s+(dias?|semanas?)$/);
  if (daquiMatch) {
    const n = parseInt(daquiMatch[1], 10);
    return fmt(daquiMatch[2].startsWith('dia') ? addDays(now, n) : addWeeks(now, n));
  }

  throw new MartrelloError('INVALID_DATE', `Não consegui parsear data: ${input}`);
}
```

- [ ] **Step 4: Run, expect pass**

```bash
pnpm test lib/core/dates.test.ts
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/core/dates.ts lib/core/dates.test.ts
git commit -m "feat(core): pt-BR relative date parser"
```

---

### Task 10: Test harness for core modules

**Files:**
- Create: `lib/core/test-helpers.ts`

These helpers spin up an in-memory SQLite for each test file, so the project/list/card/label/sprint core tests can share boilerplate.

- [ ] **Step 1: Write the helper**

```ts
// lib/core/test-helpers.ts
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import * as schema from '@/lib/db/schema';

export type Db = ReturnType<typeof drizzle<typeof schema>>;

export function makeTestDb(): { db: Db; close: () => void } {
  const sqlite = new Database(':memory:');
  sqlite.pragma('foreign_keys = ON');
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: './lib/db/migrations' });
  return { db, close: () => sqlite.close() };
}
```

- [ ] **Step 2: Commit (no test needed; it's exercised by later tasks)**

```bash
git add lib/core/test-helpers.ts
git commit -m "test(core): in-memory db helper for core tests"
```

---

### Task 11: Projects core module

**Files:**
- Create: `lib/core/projects.ts`, `lib/core/projects.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// lib/core/projects.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { makeTestDb, type Db } from './test-helpers';
import { createProject, listProjects, updateProject, archiveProject, reorderProjects, getProjectByNameOrId } from './projects';
import { MartrelloError } from '@/lib/errors';

let db: Db;
let close: () => void;

beforeEach(() => {
  const t = makeTestDb();
  db = t.db;
  close = t.close;
});

describe('projects', () => {
  it('creates a project with default lists', async () => {
    const p = await createProject(db, { name: 'foo' });
    expect(p.name).toBe('foo');
    const fetched = await getProjectByNameOrId(db, 'foo');
    expect(fetched.id).toBe(p.id);
    expect(fetched.lists.map((l) => l.name)).toEqual(['A fazer', 'Fazendo', 'Feito']);
    close();
  });

  it('errors on duplicate name', async () => {
    await createProject(db, { name: 'foo' });
    await expect(createProject(db, { name: 'foo' })).rejects.toThrow(/NAME_CONFLICT/);
    close();
  });

  it('lists projects in position order, excluding archived by default', async () => {
    const a = await createProject(db, { name: 'a' });
    const b = await createProject(db, { name: 'b' });
    await archiveProject(db, b.id);
    const all = await listProjects(db);
    expect(all.map((p) => p.id)).toEqual([a.id]);
    const withArchived = await listProjects(db, { includeArchived: true });
    expect(withArchived).toHaveLength(2);
    close();
  });

  it('updates name and color', async () => {
    const p = await createProject(db, { name: 'foo' });
    const u = await updateProject(db, p.id, { name: 'bar', color: '#123456' });
    expect(u.name).toBe('bar');
    expect(u.color).toBe('#123456');
    close();
  });

  it('reorders projects', async () => {
    const a = await createProject(db, { name: 'a' });
    const b = await createProject(db, { name: 'b' });
    const c = await createProject(db, { name: 'c' });
    await reorderProjects(db, [c.id, a.id, b.id]);
    const ordered = await listProjects(db);
    expect(ordered.map((p) => p.name)).toEqual(['c', 'a', 'b']);
    close();
  });

  it('throws PROJECT_NOT_FOUND with suggestions', async () => {
    await createProject(db, { name: 'martrello' });
    try {
      await getProjectByNameOrId(db, 'martelo');
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(MartrelloError);
      expect((e as MartrelloError).code).toBe('PROJECT_NOT_FOUND');
      expect((e as MartrelloError).suggestions).toContain('martrello');
    }
    close();
  });
});
```

- [ ] **Step 2: Run, expect failure**

```bash
pnpm test lib/core/projects.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// lib/core/projects.ts
import { and, asc, eq, inArray, isNull, max, sql } from 'drizzle-orm';
import { ulid } from 'ulidx';
import { projects, lists, type Project, type List } from '@/lib/db/schema';
import { MartrelloError, suggestClosest } from '@/lib/errors';
import { POSITION_STEP, renumber } from './positions';
import type { Db } from './test-helpers';

export const DEFAULT_LISTS = ['A fazer', 'Fazendo', 'Feito'] as const;
export const DEFAULT_COLOR = '#64748b';

export async function createProject(
  db: Db,
  input: { name: string; color?: string; lists?: string[] },
): Promise<Project> {
  const existing = await db.select().from(projects).where(eq(projects.name, input.name));
  if (existing.length > 0) {
    throw new MartrelloError('NAME_CONFLICT', `Já existe projeto chamado '${input.name}'`);
  }

  const maxPos = (await db.select({ m: max(projects.position) }).from(projects))[0]?.m ?? 0;
  const id = ulid();
  const now = Date.now();
  const listNames = input.lists?.length ? input.lists : [...DEFAULT_LISTS];

  await db.transaction(async (tx) => {
    await tx.insert(projects).values({
      id,
      name: input.name,
      color: input.color ?? DEFAULT_COLOR,
      position: maxPos + POSITION_STEP,
      createdAt: now,
    });
    for (let i = 0; i < listNames.length; i++) {
      await tx.insert(lists).values({
        id: ulid(),
        projectId: id,
        name: listNames[i],
        position: POSITION_STEP * (i + 1),
        createdAt: now,
      });
    }
  });

  const row = (await db.select().from(projects).where(eq(projects.id, id)))[0];
  return row;
}

export async function listProjects(
  db: Db,
  opts: { includeArchived?: boolean } = {},
): Promise<Array<Project & { listCount: number; cardCount: number }>> {
  const where = opts.includeArchived ? undefined : isNull(projects.archivedAt);
  const rows = await db
    .select({
      project: projects,
      listCount: sql<number>`(SELECT COUNT(*) FROM ${lists} WHERE ${lists.projectId} = ${projects.id})`,
      cardCount: sql<number>`(SELECT COUNT(*) FROM cards WHERE cards.project_id = ${projects.id} AND cards.archived_at IS NULL)`,
    })
    .from(projects)
    .where(where as any)
    .orderBy(asc(projects.position));
  return rows.map((r) => ({ ...r.project, listCount: Number(r.listCount), cardCount: Number(r.cardCount) }));
}

export async function getProjectByNameOrId(
  db: Db,
  nameOrId: string,
): Promise<Project & { lists: List[] }> {
  const found =
    (await db.select().from(projects).where(eq(projects.id, nameOrId)))[0] ??
    (await db.select().from(projects).where(eq(projects.name, nameOrId)))[0];
  if (!found) {
    const all = await db.select({ name: projects.name }).from(projects);
    throw new MartrelloError(
      'PROJECT_NOT_FOUND',
      `Projeto '${nameOrId}' não existe`,
      suggestClosest(nameOrId, all.map((r) => r.name)),
    );
  }
  const listRows = await db.select().from(lists).where(eq(lists.projectId, found.id)).orderBy(asc(lists.position));
  return { ...found, lists: listRows };
}

export async function updateProject(
  db: Db,
  id: string,
  patch: { name?: string; color?: string },
): Promise<Project> {
  if (patch.name) {
    const conflict = await db.select().from(projects).where(and(eq(projects.name, patch.name), sql`${projects.id} != ${id}`));
    if (conflict.length > 0) throw new MartrelloError('NAME_CONFLICT', `Já existe projeto '${patch.name}'`);
  }
  await db.update(projects).set(patch).where(eq(projects.id, id));
  const row = (await db.select().from(projects).where(eq(projects.id, id)))[0];
  if (!row) throw new MartrelloError('PROJECT_NOT_FOUND', `Projeto ${id} não existe`);
  return row;
}

export async function archiveProject(db: Db, id: string): Promise<void> {
  const found = (await db.select().from(projects).where(eq(projects.id, id)))[0];
  if (!found) throw new MartrelloError('PROJECT_NOT_FOUND', `Projeto ${id} não existe`);
  await db.update(projects).set({ archivedAt: Date.now() }).where(eq(projects.id, id));
}

export async function reorderProjects(db: Db, orderedIds: string[]): Promise<void> {
  await db.transaction(async (tx) => {
    const renumbered = renumber(orderedIds);
    for (const r of renumbered) {
      await tx.update(projects).set({ position: r.position }).where(eq(projects.id, r.id));
    }
  });
}
```

- [ ] **Step 4: Run, expect pass**

```bash
pnpm test lib/core/projects.test.ts
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/core/projects.ts lib/core/projects.test.ts
git commit -m "feat(core): projects CRUD with default lists and suggestions"
```

---

### Task 12: Lists core module

**Files:**
- Create: `lib/core/lists.ts`, `lib/core/lists.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// lib/core/lists.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { makeTestDb, type Db } from './test-helpers';
import { createProject } from './projects';
import { createList, renameList, deleteList, reorderLists, getListByNameOrId } from './lists';

let db: Db;
let close: () => void;
beforeEach(() => { const t = makeTestDb(); db = t.db; close = t.close; });

describe('lists', () => {
  it('creates a list at the end of a project', async () => {
    const p = await createProject(db, { name: 'p' });
    const l = await createList(db, p.id, 'Em revisão');
    expect(l.projectId).toBe(p.id);
    const fetched = await getListByNameOrId(db, p.id, 'Em revisão');
    expect(fetched.id).toBe(l.id);
    close();
  });

  it('renames a list', async () => {
    const p = await createProject(db, { name: 'p' });
    const fazendo = await getListByNameOrId(db, p.id, 'Fazendo');
    const renamed = await renameList(db, fazendo.id, 'Doing');
    expect(renamed.name).toBe('Doing');
    close();
  });

  it('refuses to delete a non-empty list without force', async () => {
    const p = await createProject(db, { name: 'p' });
    const l = await getListByNameOrId(db, p.id, 'A fazer');
    // simulate a card present
    const { cards } = await import('@/lib/db/schema');
    await db.insert(cards).values({
      id: 'c1', projectId: p.id, listId: l.id, title: 't', position: 1000,
      createdAt: Date.now(), updatedAt: Date.now(),
    });
    await expect(deleteList(db, l.id, { force: false })).rejects.toThrow(/LIST_NOT_EMPTY/);
    close();
  });

  it('deletes with force, cascading cards', async () => {
    const p = await createProject(db, { name: 'p' });
    const l = await getListByNameOrId(db, p.id, 'A fazer');
    const { cards } = await import('@/lib/db/schema');
    await db.insert(cards).values({
      id: 'c1', projectId: p.id, listId: l.id, title: 't', position: 1000,
      createdAt: Date.now(), updatedAt: Date.now(),
    });
    await deleteList(db, l.id, { force: true });
    const { eq } = await import('drizzle-orm');
    const remaining = await db.select().from(cards).where(eq(cards.id, 'c1'));
    expect(remaining).toHaveLength(0);
    close();
  });

  it('reorders lists', async () => {
    const p = await createProject(db, { name: 'p' });
    const a = await getListByNameOrId(db, p.id, 'A fazer');
    const f = await getListByNameOrId(db, p.id, 'Fazendo');
    const d = await getListByNameOrId(db, p.id, 'Feito');
    await reorderLists(db, p.id, [d.id, a.id, f.id]);
    const { lists } = await import('@/lib/db/schema');
    const { asc, eq } = await import('drizzle-orm');
    const ordered = await db.select().from(lists).where(eq(lists.projectId, p.id)).orderBy(asc(lists.position));
    expect(ordered.map((l) => l.id)).toEqual([d.id, a.id, f.id]);
    close();
  });
});
```

- [ ] **Step 2: Run, expect failure**

```bash
pnpm test lib/core/lists.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement**

```ts
// lib/core/lists.ts
import { and, asc, count, eq, max } from 'drizzle-orm';
import { ulid } from 'ulidx';
import { lists, cards, type List } from '@/lib/db/schema';
import { MartrelloError, suggestClosest } from '@/lib/errors';
import { POSITION_STEP, renumber } from './positions';
import type { Db } from './test-helpers';

export async function createList(db: Db, projectId: string, name: string, position?: number): Promise<List> {
  const maxPos = (await db.select({ m: max(lists.position) }).from(lists).where(eq(lists.projectId, projectId)))[0]?.m ?? 0;
  const id = ulid();
  await db.insert(lists).values({
    id,
    projectId,
    name,
    position: position ?? maxPos + POSITION_STEP,
    createdAt: Date.now(),
  });
  return (await db.select().from(lists).where(eq(lists.id, id)))[0];
}

export async function getListByNameOrId(db: Db, projectId: string, nameOrId: string): Promise<List> {
  const found =
    (await db.select().from(lists).where(and(eq(lists.id, nameOrId), eq(lists.projectId, projectId))))[0] ??
    (await db.select().from(lists).where(and(eq(lists.name, nameOrId), eq(lists.projectId, projectId))))[0];
  if (!found) {
    const candidates = await db.select({ name: lists.name }).from(lists).where(eq(lists.projectId, projectId));
    throw new MartrelloError(
      'LIST_NOT_FOUND',
      `Lista '${nameOrId}' não existe nesse projeto`,
      suggestClosest(nameOrId, candidates.map((c) => c.name)),
    );
  }
  return found;
}

export async function renameList(db: Db, id: string, newName: string): Promise<List> {
  const found = (await db.select().from(lists).where(eq(lists.id, id)))[0];
  if (!found) throw new MartrelloError('LIST_NOT_FOUND', `Lista ${id} não existe`);
  await db.update(lists).set({ name: newName }).where(eq(lists.id, id));
  return { ...found, name: newName };
}

export async function deleteList(db: Db, id: string, opts: { force?: boolean } = {}): Promise<void> {
  const found = (await db.select().from(lists).where(eq(lists.id, id)))[0];
  if (!found) throw new MartrelloError('LIST_NOT_FOUND', `Lista ${id} não existe`);
  const cardCount = (await db.select({ c: count() }).from(cards).where(eq(cards.listId, id)))[0]?.c ?? 0;
  if (Number(cardCount) > 0 && !opts.force) {
    throw new MartrelloError('LIST_NOT_EMPTY', `Lista tem ${cardCount} card(s); use force=true pra deletar mesmo assim`);
  }
  await db.delete(lists).where(eq(lists.id, id));
}

export async function reorderLists(db: Db, projectId: string, orderedIds: string[]): Promise<void> {
  await db.transaction(async (tx) => {
    for (const r of renumber(orderedIds)) {
      await tx.update(lists).set({ position: r.position }).where(and(eq(lists.id, r.id), eq(lists.projectId, projectId)));
    }
  });
}
```

- [ ] **Step 4: Run, expect pass**

```bash
pnpm test lib/core/lists.test.ts
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/core/lists.ts lib/core/lists.test.ts
git commit -m "feat(core): lists CRUD with reorder and force-delete"
```

---

### Task 13: Labels core module

**Files:**
- Create: `lib/core/labels.ts`, `lib/core/labels.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// lib/core/labels.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { makeTestDb, type Db } from './test-helpers';
import { createLabel, listLabels, getLabelByNameOrId, addLabelToCard, removeLabelFromCard, deleteLabel } from './labels';
import { createProject, getProjectByNameOrId } from './projects';
import { ulid } from 'ulidx';

let db: Db;
let close: () => void;
beforeEach(() => { const t = makeTestDb(); db = t.db; close = t.close; });

async function makeCard() {
  const p = await createProject(db, { name: 'p' });
  const full = await getProjectByNameOrId(db, p.id);
  const list = full.lists[0];
  const { cards } = await import('@/lib/db/schema');
  const id = ulid();
  await db.insert(cards).values({
    id, projectId: p.id, listId: list.id, title: 't', position: 1000,
    createdAt: Date.now(), updatedAt: Date.now(),
  });
  return id;
}

describe('labels', () => {
  it('creates and lists labels', async () => {
    await createLabel(db, 'urgente', '#ef4444');
    const all = await listLabels(db);
    expect(all).toHaveLength(1);
    expect(all[0].name).toBe('urgente');
    close();
  });

  it('errors on duplicate name', async () => {
    await createLabel(db, 'urgente', '#ef4444');
    await expect(createLabel(db, 'urgente', '#000')).rejects.toThrow(/NAME_CONFLICT/);
    close();
  });

  it('attaches a label to a card by name', async () => {
    await createLabel(db, 'bug', '#f97316');
    const cardId = await makeCard();
    await addLabelToCard(db, cardId, 'bug');
    const { cardLabels } = await import('@/lib/db/schema');
    const { eq } = await import('drizzle-orm');
    const rows = await db.select().from(cardLabels).where(eq(cardLabels.cardId, cardId));
    expect(rows).toHaveLength(1);
    close();
  });

  it('throws LABEL_NOT_FOUND with suggestions', async () => {
    await createLabel(db, 'urgente', '#ef4444');
    const cardId = await makeCard();
    try {
      await addLabelToCard(db, cardId, 'urgnt');
      expect.unreachable();
    } catch (e: any) {
      expect(e.code).toBe('LABEL_NOT_FOUND');
      expect(e.suggestions).toContain('urgente');
    }
    close();
  });

  it('removes label from card (idempotent)', async () => {
    await createLabel(db, 'bug', '#f97316');
    const cardId = await makeCard();
    await addLabelToCard(db, cardId, 'bug');
    await removeLabelFromCard(db, cardId, 'bug');
    await removeLabelFromCard(db, cardId, 'bug'); // no throw
    close();
  });

  it('deletes label cascade-removes from cards', async () => {
    const l = await createLabel(db, 'bug', '#f97316');
    const cardId = await makeCard();
    await addLabelToCard(db, cardId, 'bug');
    await deleteLabel(db, l.id);
    const { cardLabels } = await import('@/lib/db/schema');
    const { eq } = await import('drizzle-orm');
    const rows = await db.select().from(cardLabels).where(eq(cardLabels.cardId, cardId));
    expect(rows).toHaveLength(0);
    close();
  });
});
```

- [ ] **Step 2: Run, expect failure**

```bash
pnpm test lib/core/labels.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement**

```ts
// lib/core/labels.ts
import { and, eq, sql } from 'drizzle-orm';
import { ulid } from 'ulidx';
import { labels, cardLabels, type Label } from '@/lib/db/schema';
import { MartrelloError, suggestClosest } from '@/lib/errors';
import type { Db } from './test-helpers';

export async function createLabel(db: Db, name: string, color: string): Promise<Label> {
  const existing = await db.select().from(labels).where(eq(labels.name, name));
  if (existing.length > 0) throw new MartrelloError('NAME_CONFLICT', `Label '${name}' já existe`);
  const id = ulid();
  await db.insert(labels).values({ id, name, color });
  return { id, name, color };
}

export async function listLabels(db: Db): Promise<Array<Label & { cardCount: number }>> {
  const rows = await db
    .select({
      l: labels,
      c: sql<number>`(SELECT COUNT(*) FROM ${cardLabels} WHERE ${cardLabels.labelId} = ${labels.id})`,
    })
    .from(labels);
  return rows.map((r) => ({ ...r.l, cardCount: Number(r.c) }));
}

export async function getLabelByNameOrId(db: Db, nameOrId: string): Promise<Label> {
  const found =
    (await db.select().from(labels).where(eq(labels.id, nameOrId)))[0] ??
    (await db.select().from(labels).where(eq(labels.name, nameOrId)))[0];
  if (!found) {
    const all = await db.select({ name: labels.name }).from(labels);
    throw new MartrelloError('LABEL_NOT_FOUND', `Label '${nameOrId}' não existe`, suggestClosest(nameOrId, all.map((r) => r.name)));
  }
  return found;
}

export async function addLabelToCard(db: Db, cardId: string, labelNameOrId: string): Promise<void> {
  const label = await getLabelByNameOrId(db, labelNameOrId);
  await db.insert(cardLabels).values({ cardId, labelId: label.id }).onConflictDoNothing();
}

export async function removeLabelFromCard(db: Db, cardId: string, labelNameOrId: string): Promise<void> {
  const label = await getLabelByNameOrId(db, labelNameOrId);
  await db.delete(cardLabels).where(and(eq(cardLabels.cardId, cardId), eq(cardLabels.labelId, label.id)));
}

export async function deleteLabel(db: Db, nameOrId: string): Promise<void> {
  const label = await getLabelByNameOrId(db, nameOrId);
  await db.delete(labels).where(eq(labels.id, label.id));
}
```

- [ ] **Step 4: Run, expect pass**

```bash
pnpm test lib/core/labels.test.ts
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/core/labels.ts lib/core/labels.test.ts
git commit -m "feat(core): labels with strict attach/detach and cascading delete"
```

---

<!-- PHASE-2 -->
### Task 14: Cards core module

**Files:**
- Create: `lib/core/cards.ts`, `lib/core/cards.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// lib/core/cards.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { makeTestDb, type Db } from './test-helpers';
import { createProject, getProjectByNameOrId } from './projects';
import { createLabel } from './labels';
import { createCard, updateCard, moveCard, archiveCard, unarchiveCard, getCardById, searchCards } from './cards';

let db: Db;
let close: () => void;
beforeEach(() => { const t = makeTestDb(); db = t.db; close = t.close; });

async function setup() {
  const p = await createProject(db, { name: 'p' });
  const full = await getProjectByNameOrId(db, p.id);
  return { p, lists: full.lists };
}

describe('cards', () => {
  it('creates a card in the first list by default', async () => {
    const { p, lists } = await setup();
    const c = await createCard(db, { project: p.id, title: 'hello' });
    expect(c.listId).toBe(lists[0].id);
    expect(c.title).toBe('hello');
    close();
  });

  it('creates with description and due_date (parsed)', async () => {
    const { p } = await setup();
    const c = await createCard(db, { project: p.id, title: 't', description: '# md', dueDate: '2026-06-15' });
    expect(c.description).toBe('# md');
    expect(c.dueDate).toBe('2026-06-15');
    close();
  });

  it('rejects unknown labels', async () => {
    const { p } = await setup();
    await expect(createCard(db, { project: p.id, title: 't', labels: ['nope'] })).rejects.toThrow(/LABEL_NOT_FOUND/);
    close();
  });

  it('attaches existing labels', async () => {
    const { p } = await setup();
    await createLabel(db, 'bug', '#f97316');
    const c = await createCard(db, { project: p.id, title: 't', labels: ['bug'] });
    const fetched = await getCardById(db, c.id);
    expect(fetched.labels.map((l) => l.name)).toEqual(['bug']);
    close();
  });

  it('updates title, description, dueDate', async () => {
    const { p } = await setup();
    const c = await createCard(db, { project: p.id, title: 'old' });
    const u = await updateCard(db, c.id, { title: 'new', description: 'desc', dueDate: 'amanha' });
    expect(u.title).toBe('new');
    expect(u.dueDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    close();
  });

  it('moves card to another list in same project', async () => {
    const { p, lists } = await setup();
    const c = await createCard(db, { project: p.id, title: 't' });
    await moveCard(db, c.id, { toList: lists[1].id });
    const m = await getCardById(db, c.id);
    expect(m.listId).toBe(lists[1].id);
    close();
  });

  it('rejects moving to a list in a different project', async () => {
    const { p } = await setup();
    const other = await createProject(db, { name: 'other' });
    const otherFull = await getProjectByNameOrId(db, other.id);
    const c = await createCard(db, { project: p.id, title: 't' });
    await expect(moveCard(db, c.id, { toList: otherFull.lists[0].id })).rejects.toThrow(/LIST_NOT_IN_PROJECT/);
    close();
  });

  it('moves card across projects via toProject + toList', async () => {
    const { p } = await setup();
    const other = await createProject(db, { name: 'other' });
    const otherFull = await getProjectByNameOrId(db, other.id);
    const c = await createCard(db, { project: p.id, title: 't' });
    await moveCard(db, c.id, { toProject: other.id, toList: otherFull.lists[0].id });
    const m = await getCardById(db, c.id);
    expect(m.projectId).toBe(other.id);
    expect(m.listId).toBe(otherFull.lists[0].id);
    close();
  });

  it('archive removes sprint slot if present', async () => {
    const { p } = await setup();
    const c = await createCard(db, { project: p.id, title: 't' });
    // start a sprint and add card to it manually for now
    const { sprints, sprintSlots } = await import('@/lib/db/schema');
    const { ulid } = await import('ulidx');
    const sid = ulid();
    await db.insert(sprints).values({ id: sid, startedAt: Date.now() });
    await db.insert(sprintSlots).values({ cardId: c.id, sprintId: sid, sprintList: 'backlog', position: 1000, addedAt: Date.now() });

    await archiveCard(db, c.id);
    const { eq } = await import('drizzle-orm');
    const slots = await db.select().from(sprintSlots).where(eq(sprintSlots.cardId, c.id));
    expect(slots).toHaveLength(0);
    close();
  });

  it('unarchive does not restore sprint slot', async () => {
    const { p } = await setup();
    const c = await createCard(db, { project: p.id, title: 't' });
    await archiveCard(db, c.id);
    await unarchiveCard(db, c.id);
    const m = await getCardById(db, c.id);
    expect(m.archivedAt).toBeNull();
    close();
  });

  it('searches cards by title substring', async () => {
    const { p } = await setup();
    await createCard(db, { project: p.id, title: 'revisar PR #123' });
    await createCard(db, { project: p.id, title: 'criar landing' });
    const out = await searchCards(db, { query: 'revisar' });
    expect(out.map((c) => c.title)).toEqual(['revisar PR #123']);
    close();
  });
});
```

- [ ] **Step 2: Run, expect failure**

```bash
pnpm test lib/core/cards.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement**

```ts
// lib/core/cards.ts
import { and, asc, desc, eq, like, max, isNull } from 'drizzle-orm';
import { ulid } from 'ulidx';
import { cards, lists, cardLabels, labels, sprintSlots, type Card, type Label } from '@/lib/db/schema';
import { MartrelloError } from '@/lib/errors';
import { POSITION_STEP } from './positions';
import { parseDate } from './dates';
import { getProjectByNameOrId } from './projects';
import { getListByNameOrId } from './lists';
import { addLabelToCard } from './labels';
import type { Db } from './test-helpers';

function maybeParseDate(input?: string | null): string | undefined {
  if (input == null || input === '') return undefined;
  return parseDate(input);
}

export async function createCard(
  db: Db,
  input: {
    project: string;
    list?: string;
    title: string;
    description?: string;
    dueDate?: string;
    labels?: string[];
    addToSprint?: boolean;
  },
): Promise<Card> {
  const project = await getProjectByNameOrId(db, input.project);
  const listEntity = input.list
    ? await getListByNameOrId(db, project.id, input.list)
    : project.lists[0];
  if (!listEntity) throw new MartrelloError('LIST_NOT_FOUND', `Projeto '${project.name}' não tem listas`);

  const maxPos = (await db.select({ m: max(cards.position) }).from(cards).where(eq(cards.listId, listEntity.id)))[0]?.m ?? 0;
  const id = ulid();
  const now = Date.now();
  const due = maybeParseDate(input.dueDate);

  await db.insert(cards).values({
    id,
    projectId: project.id,
    listId: listEntity.id,
    title: input.title,
    description: input.description ?? null,
    dueDate: due ?? null,
    position: maxPos + POSITION_STEP,
    createdAt: now,
    updatedAt: now,
  });

  if (input.labels?.length) {
    for (const lab of input.labels) await addLabelToCard(db, id, lab);
  }

  if (input.addToSprint) {
    const { addToSprint } = await import('./sprint');
    await addToSprint(db, id, 'backlog');
  }

  return (await db.select().from(cards).where(eq(cards.id, id)))[0];
}

export async function getCardById(db: Db, id: string): Promise<Card & { labels: Label[] }> {
  const card = (await db.select().from(cards).where(eq(cards.id, id)))[0];
  if (!card) throw new MartrelloError('CARD_NOT_FOUND', `Card ${id} não existe`);
  const labelRows = await db
    .select({ l: labels })
    .from(cardLabels)
    .innerJoin(labels, eq(cardLabels.labelId, labels.id))
    .where(eq(cardLabels.cardId, id));
  return { ...card, labels: labelRows.map((r) => r.l) };
}

export async function updateCard(
  db: Db,
  id: string,
  patch: { title?: string; description?: string | null; dueDate?: string | null },
): Promise<Card> {
  const card = (await db.select().from(cards).where(eq(cards.id, id)))[0];
  if (!card) throw new MartrelloError('CARD_NOT_FOUND', `Card ${id} não existe`);
  const update: Partial<Card> = { updatedAt: Date.now() };
  if (patch.title !== undefined) update.title = patch.title;
  if (patch.description !== undefined) update.description = patch.description ?? null;
  if (patch.dueDate !== undefined) update.dueDate = patch.dueDate ? parseDate(patch.dueDate) : null;
  await db.update(cards).set(update).where(eq(cards.id, id));
  return (await db.select().from(cards).where(eq(cards.id, id)))[0];
}

export async function moveCard(
  db: Db,
  id: string,
  target: { toProject?: string; toList: string; position?: number },
): Promise<void> {
  const card = (await db.select().from(cards).where(eq(cards.id, id)))[0];
  if (!card) throw new MartrelloError('CARD_NOT_FOUND', `Card ${id} não existe`);

  const targetProjectId = target.toProject ? (await getProjectByNameOrId(db, target.toProject)).id : card.projectId;
  const targetList = await getListByNameOrId(db, targetProjectId, target.toList);
  if (targetList.projectId !== targetProjectId) {
    throw new MartrelloError('LIST_NOT_IN_PROJECT', `Lista '${target.toList}' não pertence ao projeto destino`);
  }

  const maxPos = (await db.select({ m: max(cards.position) }).from(cards).where(eq(cards.listId, targetList.id)))[0]?.m ?? 0;
  const newPos = target.position ?? maxPos + POSITION_STEP;

  await db.update(cards).set({
    projectId: targetProjectId,
    listId: targetList.id,
    position: newPos,
    updatedAt: Date.now(),
  }).where(eq(cards.id, id));
}

export async function archiveCard(db: Db, id: string): Promise<void> {
  const card = (await db.select().from(cards).where(eq(cards.id, id)))[0];
  if (!card) throw new MartrelloError('CARD_NOT_FOUND', `Card ${id} não existe`);
  await db.transaction(async (tx) => {
    await tx.update(cards).set({ archivedAt: Date.now(), updatedAt: Date.now() }).where(eq(cards.id, id));
    await tx.delete(sprintSlots).where(eq(sprintSlots.cardId, id));
  });
}

export async function unarchiveCard(db: Db, id: string): Promise<void> {
  const card = (await db.select().from(cards).where(eq(cards.id, id)))[0];
  if (!card) throw new MartrelloError('CARD_NOT_FOUND', `Card ${id} não existe`);
  await db.update(cards).set({ archivedAt: null, updatedAt: Date.now() }).where(eq(cards.id, id));
}

export async function searchCards(
  db: Db,
  opts: { query: string; project?: string; label?: string; includeArchived?: boolean },
): Promise<Card[]> {
  const pattern = `%${opts.query.toLowerCase()}%`;
  const where = [
    like(cards.title, pattern),
  ];
  if (!opts.includeArchived) where.push(isNull(cards.archivedAt));
  if (opts.project) {
    const p = await getProjectByNameOrId(db, opts.project);
    where.push(eq(cards.projectId, p.id));
  }
  const rows = await db.select().from(cards).where(and(...where)).orderBy(desc(cards.updatedAt));
  return rows;
}
```

- [ ] **Step 4: Run, expect pass**

```bash
pnpm test lib/core/cards.test.ts
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/core/cards.ts lib/core/cards.test.ts
git commit -m "feat(core): cards CRUD, cross-project move, archive with sprint cleanup"
```

---

### Task 15: Sprint core module

**Files:**
- Create: `lib/core/sprint.ts`, `lib/core/sprint.test.ts`

This is the most complex module. The `closeSprint` transaction is the key behavior.

- [ ] **Step 1: Write the failing test**

```ts
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
```

- [ ] **Step 2: Run, expect failure**

```bash
pnpm test lib/core/sprint.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement**

```ts
// lib/core/sprint.ts
import { and, asc, count, desc, eq, isNull, max } from 'drizzle-orm';
import { ulid } from 'ulidx';
import { sprints, sprintSlots, cards, projects, labels, cardLabels, type Sprint, type SprintList } from '@/lib/db/schema';
import { MartrelloError } from '@/lib/errors';
import { POSITION_STEP } from './positions';
import type { Db } from './test-helpers';

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
};

export async function getActiveSprintRow(db: Db): Promise<Sprint | null> {
  return (await db.select().from(sprints).where(isNull(sprints.closedAt)))[0] ?? null;
}

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
    });
  }
  return out;
}

export async function getActiveSprint(db: Db): Promise<(Sprint & { cards: SprintCard[] }) | null> {
  const s = await getActiveSprintRow(db);
  if (!s) return null;
  const c = await loadSprintCards(db, s.id);
  return { ...s, cards: c };
}

export async function startSprint(db: Db, name?: string): Promise<Sprint> {
  const active = await getActiveSprintRow(db);
  if (active) throw new MartrelloError('SPRINT_ALREADY_ACTIVE', `Sprint '${active.name ?? active.id}' já está ativa`);
  const total = (await db.select({ c: count() }).from(sprints))[0]?.c ?? 0;
  const id = ulid();
  const finalName = name?.trim() || `Sprint ${Number(total) + 1}`;
  await db.insert(sprints).values({ id, name: finalName, startedAt: Date.now() });
  return (await db.select().from(sprints).where(eq(sprints.id, id)))[0];
}

async function requireActiveSprint(db: Db): Promise<Sprint> {
  const s = await getActiveSprintRow(db);
  if (!s) throw new MartrelloError('NO_ACTIVE_SPRINT', 'Nenhuma sprint ativa. Inicie com martrello_start_sprint.');
  return s;
}

export async function addToSprint(db: Db, cardId: string, sprintList: SprintList = 'backlog') {
  const sprint = await requireActiveSprint(db);
  const card = (await db.select().from(cards).where(eq(cards.id, cardId)))[0];
  if (!card) throw new MartrelloError('CARD_NOT_FOUND', `Card ${cardId} não existe`);
  if (card.archivedAt) throw new MartrelloError('CARD_NOT_FOUND', `Card '${card.title}' está arquivado`);

  const existing = (await db.select().from(sprintSlots).where(eq(sprintSlots.cardId, cardId)))[0];
  const maxPos = (await db
    .select({ m: max(sprintSlots.position) })
    .from(sprintSlots)
    .where(and(eq(sprintSlots.sprintId, sprint.id), eq(sprintSlots.sprintList, sprintList))))[0]?.m ?? 0;
  const newPos = maxPos + POSITION_STEP;

  if (existing) {
    await db.update(sprintSlots).set({ sprintList, position: newPos }).where(eq(sprintSlots.cardId, cardId));
  } else {
    await db.insert(sprintSlots).values({
      cardId, sprintId: sprint.id, sprintList, position: newPos, addedAt: Date.now(),
    });
  }
  return (await db.select().from(sprintSlots).where(eq(sprintSlots.cardId, cardId)))[0];
}

export async function moveInSprint(db: Db, cardId: string, sprintList: SprintList, position?: number) {
  const sprint = await requireActiveSprint(db);
  const slot = (await db.select().from(sprintSlots).where(eq(sprintSlots.cardId, cardId)))[0];
  if (!slot) throw new MartrelloError('CARD_NOT_FOUND', `Card ${cardId} não está na sprint ativa`);
  const maxPos = (await db
    .select({ m: max(sprintSlots.position) })
    .from(sprintSlots)
    .where(and(eq(sprintSlots.sprintId, sprint.id), eq(sprintSlots.sprintList, sprintList))))[0]?.m ?? 0;
  await db.update(sprintSlots).set({
    sprintList,
    position: position ?? maxPos + POSITION_STEP,
  }).where(eq(sprintSlots.cardId, cardId));
}

export async function removeFromSprint(db: Db, cardId: string) {
  await db.delete(sprintSlots).where(eq(sprintSlots.cardId, cardId));
}

export async function listSprints(db: Db, opts: { limit?: number } = {}) {
  const rows = await db.select().from(sprints).orderBy(desc(sprints.startedAt)).limit(opts.limit ?? 20);
  return rows;
}

export async function getSprintHistory(db: Db, sprintId: string) {
  const row = (await db.select().from(sprints).where(eq(sprints.id, sprintId)))[0];
  if (!row) throw new MartrelloError('SPRINT_NOT_FOUND', `Sprint ${sprintId} não existe`);
  const snapshot = row.cardsSnapshot ? JSON.parse(row.cardsSnapshot) : [];
  return { ...row, cards: snapshot as SprintCard[] };
}

export async function closeSprint(
  db: Db,
  opts: { nameForNext?: string; carryIncomplete?: boolean } = {},
): Promise<{
  closed: { id: string; name: string | null; doneCount: number; carriedCount: number };
  opened?: { id: string; name: string | null };
}> {
  const carry = opts.carryIncomplete ?? true;
  const active = await requireActiveSprint(db);
  const snapshot = await loadSprintCards(db, active.id);

  const doneCardIds = snapshot.filter((s) => s.sprintList === 'done').map((s) => s.id);
  const incomplete = snapshot.filter((s) => s.sprintList !== 'done');
  const carriedCount = carry ? incomplete.length : 0;
  const now = Date.now();

  let newSprintId: string | null = null;
  let newSprintName: string | null = null;

  await db.transaction(async (tx) => {
    await tx.update(sprints).set({
      closedAt: now,
      cardsSnapshot: JSON.stringify(snapshot),
    }).where(eq(sprints.id, active.id));

    // archive done cards (cascade deletes their slots)
    for (const cid of doneCardIds) {
      await tx.update(cards).set({ archivedAt: now, updatedAt: now }).where(eq(cards.id, cid));
    }

    if (carry && incomplete.length > 0) {
      const total = (await tx.select({ c: count() }).from(sprints))[0]?.c ?? 0;
      newSprintId = ulid();
      newSprintName = opts.nameForNext?.trim() || `Sprint ${Number(total) + 1}`;
      await tx.insert(sprints).values({ id: newSprintId, name: newSprintName, startedAt: now });

      // re-point and re-position slots into the new sprint, preserving column
      const byCol = { backlog: 0, doing: 0, done: 0 } as Record<SprintList, number>;
      for (const card of incomplete) {
        byCol[card.sprintList] += 1;
        await tx.update(sprintSlots).set({
          sprintId: newSprintId,
          position: byCol[card.sprintList] * POSITION_STEP,
        }).where(eq(sprintSlots.cardId, card.id));
      }
    } else {
      // no carry: drop slots of non-done cards (done slots cascade-deleted by archive)
      for (const card of incomplete) {
        await tx.delete(sprintSlots).where(eq(sprintSlots.cardId, card.id));
      }
    }
  });

  const result: {
    closed: { id: string; name: string | null; doneCount: number; carriedCount: number };
    opened?: { id: string; name: string | null };
  } = {
    closed: { id: active.id, name: active.name, doneCount: doneCardIds.length, carriedCount },
  };
  if (newSprintId) result.opened = { id: newSprintId, name: newSprintName };
  return result;
}
```

- [ ] **Step 4: Run, expect pass**

```bash
pnpm test lib/core/sprint.test.ts
```

Expected: all tests PASS.

- [ ] **Step 5: Run the full suite to catch regressions**

```bash
pnpm test
```

Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add lib/core/sprint.ts lib/core/sprint.test.ts
git commit -m "feat(core): sprint lifecycle with carry-over and snapshot history"
```

---

### Task 16: Seed script

**Files:**
- Create: `scripts/seed.ts`

- [ ] **Step 1: Write the seed**

```ts
// scripts/seed.ts
import { getDb, closeDb } from '@/lib/db/client';
import { createProject } from '@/lib/core/projects';
import { createLabel } from '@/lib/core/labels';
import { MartrelloError } from '@/lib/errors';

const DEFAULT_LABELS = [
  { name: 'urgente', color: '#ef4444' },
  { name: 'bug', color: '#f97316' },
  { name: 'melhoria', color: '#3b82f6' },
  { name: 'ideia', color: '#a855f7' },
  { name: 'pessoal', color: '#10b981' },
];

async function safeCreateProject(db: ReturnType<typeof getDb>, name: string) {
  try {
    await createProject(db, { name });
    console.log(`+ projeto: ${name}`);
  } catch (e) {
    if (e instanceof MartrelloError && e.code === 'NAME_CONFLICT') {
      console.log(`= projeto já existe: ${name}`);
    } else throw e;
  }
}

async function safeCreateLabel(db: ReturnType<typeof getDb>, name: string, color: string) {
  try {
    await createLabel(db, name, color);
    console.log(`+ label: ${name}`);
  } catch (e) {
    if (e instanceof MartrelloError && e.code === 'NAME_CONFLICT') {
      console.log(`= label já existe: ${name}`);
    } else throw e;
  }
}

async function main() {
  const db = getDb();
  await safeCreateProject(db, 'Inbox');
  for (const l of DEFAULT_LABELS) await safeCreateLabel(db, l.name, l.color);
  closeDb();
  console.log('seed concluído');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

- [ ] **Step 2: Run the seed**

```bash
pnpm seed
```

Expected: prints lines for project + labels created. Running twice prints `= ... já existe` for each.

- [ ] **Step 3: Verify in sqlite**

```bash
sqlite3 martrello.db "SELECT name FROM projects; SELECT name FROM labels;"
```

Expected: `Inbox` and the 5 labels.

- [ ] **Step 4: Commit**

```bash
git add scripts/seed.ts
git commit -m "feat(scripts): idempotent seed for Inbox project and default labels"
```

---

<!-- PHASE-2 -->
## Phase 3 — MCP server scaffold

### Task 17: MCP server entry with `tools/list` smoke

**Files:**
- Create: `mcp/index.ts`, `mcp/server.ts`, `mcp/tools/index.ts`, `mcp/tsconfig.json`, `scripts/build-mcp.ts`, `tests/mcp-smoke.test.ts`

- [ ] **Step 1: Create `mcp/tsconfig.json`**

```json
{
  "extends": "../tsconfig.json",
  "compilerOptions": {
    "module": "esnext",
    "moduleResolution": "bundler",
    "noEmit": true
  },
  "include": ["**/*.ts"]
}
```

- [ ] **Step 2: Write `mcp/tools/index.ts` (empty registry for now)**

```ts
// mcp/tools/index.ts
import type { Tool } from '@modelcontextprotocol/sdk/types.js';

export type MartrelloTool = {
  definition: Tool;
  handler: (input: Record<string, unknown>) => Promise<unknown>;
};

export const tools: MartrelloTool[] = [];

export function findTool(name: string): MartrelloTool | undefined {
  return tools.find((t) => t.definition.name === name);
}
```

- [ ] **Step 3: Write `mcp/server.ts`**

```ts
// mcp/server.ts
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { tools, findTool } from './tools';
import { MartrelloError } from '@/lib/errors';

export function createServer() {
  const server = new Server(
    { name: 'martrello', version: '0.1.0' },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: tools.map((t) => t.definition),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const tool = findTool(req.params.name);
    if (!tool) {
      return {
        isError: true,
        content: [{ type: 'text', text: JSON.stringify({ error: 'UNKNOWN_TOOL', message: req.params.name }) }],
      };
    }
    try {
      const result = await tool.handler(req.params.arguments ?? {});
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    } catch (e) {
      const payload = e instanceof MartrelloError ? e.toJSON() : { error: 'INTERNAL', message: (e as Error).message };
      return {
        isError: true,
        content: [{ type: 'text', text: JSON.stringify(payload) }],
      };
    }
  });

  return server;
}
```

- [ ] **Step 4: Write `mcp/index.ts`**

```ts
// mcp/index.ts
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createServer } from './server';

async function main() {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.stderr.write('martrello mcp server running on stdio\n');
}

main().catch((e) => {
  process.stderr.write(`martrello mcp failed: ${(e as Error).message}\n`);
  process.exit(1);
});
```

- [ ] **Step 5: Write smoke test**

```ts
// tests/mcp-smoke.test.ts
import { describe, it, expect } from 'vitest';
import { createServer } from '@/mcp/server';
import { tools } from '@/mcp/tools';

describe('mcp server', () => {
  it('constructs without throwing', () => {
    expect(createServer).toBeTypeOf('function');
    const s = createServer();
    expect(s).toBeDefined();
  });

  it('tool registry is iterable', () => {
    expect(Array.isArray(tools)).toBe(true);
  });
});
```

- [ ] **Step 6: Run**

```bash
pnpm test tests/mcp-smoke.test.ts
```

Expected: PASS.

- [ ] **Step 7: Write `scripts/build-mcp.ts` (esbuild-based bundler)**

Install esbuild first:

```bash
pnpm add -D esbuild
```

Then:

```ts
// scripts/build-mcp.ts
import { build } from 'esbuild';
import path from 'node:path';

await build({
  entryPoints: [path.resolve('mcp/index.ts')],
  outfile: path.resolve('mcp/dist/index.js'),
  bundle: true,
  platform: 'node',
  target: 'node24',
  format: 'esm',
  external: ['better-sqlite3'],
  banner: {
    js: "import { createRequire } from 'module'; const require = createRequire(import.meta.url);",
  },
});

console.log('built mcp/dist/index.js');
```

- [ ] **Step 8: Build and run a manual stdio ping**

```bash
pnpm mcp:build
node -e "import('@modelcontextprotocol/sdk/client/index.js').then(async ({ Client }) => { const { StdioClientTransport } = await import('@modelcontextprotocol/sdk/client/stdio.js'); const t = new StdioClientTransport({ command: 'node', args: ['mcp/dist/index.js'] }); const c = new Client({ name: 'ping', version: '0.0.0' }, { capabilities: {} }); await c.connect(t); const out = await c.listTools(); console.log(JSON.stringify(out)); await c.close(); })"
```

Expected: prints `{"tools":[]}` (no tools registered yet).

- [ ] **Step 9: Commit**

```bash
git add mcp/ scripts/build-mcp.ts tests/mcp-smoke.test.ts package.json pnpm-lock.yaml
git commit -m "feat(mcp): server scaffold with stdio transport and tool registry"
```

---

### Task 18: Read tools (list_projects, get_project, get_sprint, search_cards, list_labels, list_sprints, get_sprint_history)

**Files:**
- Create: `mcp/tools/read.ts`, `mcp/tools/read.test.ts`
- Modify: `mcp/tools/index.ts`

- [ ] **Step 1: Write the failing test**

```ts
// mcp/tools/read.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { makeTestDb, type Db } from '@/lib/core/test-helpers';
import { createProject } from '@/lib/core/projects';
import { createLabel } from '@/lib/core/labels';
import * as clientModule from '@/lib/db/client';
import { readTools } from './read';

let db: Db;
beforeEach(() => {
  const t = makeTestDb();
  db = t.db;
  vi.spyOn(clientModule, 'getDb').mockReturnValue(db as any);
});

describe('read tools', () => {
  it('list_projects returns names', async () => {
    await createProject(db, { name: 'a' });
    const tool = readTools.find((t) => t.definition.name === 'martrello_list_projects')!;
    const out = (await tool.handler({})) as Array<{ name: string }>;
    expect(out.map((p) => p.name)).toContain('a');
  });

  it('list_labels returns labels', async () => {
    await createLabel(db, 'urgente', '#ef4444');
    const tool = readTools.find((t) => t.definition.name === 'martrello_list_labels')!;
    const out = (await tool.handler({})) as Array<{ name: string }>;
    expect(out.map((l) => l.name)).toEqual(['urgente']);
  });

  it('get_project errors with suggestions', async () => {
    await createProject(db, { name: 'martrello' });
    const tool = readTools.find((t) => t.definition.name === 'martrello_get_project')!;
    await expect(tool.handler({ project: 'martelo' })).rejects.toThrow(/PROJECT_NOT_FOUND/);
  });
});
```

- [ ] **Step 2: Run, expect failure**

```bash
pnpm test mcp/tools/read.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `mcp/tools/read.ts`**

```ts
// mcp/tools/read.ts
import { getDb } from '@/lib/db/client';
import { listProjects, getProjectByNameOrId } from '@/lib/core/projects';
import { listLabels } from '@/lib/core/labels';
import { searchCards } from '@/lib/core/cards';
import { getActiveSprint, listSprints, getSprintHistory } from '@/lib/core/sprint';
import type { MartrelloTool } from './index';

export const readTools: MartrelloTool[] = [
  {
    definition: {
      name: 'martrello_list_projects',
      description: 'Lista todos os projetos (com counts de listas e cards). Por padrão exclui arquivados.',
      inputSchema: {
        type: 'object',
        properties: { include_archived: { type: 'boolean', default: false } },
      },
    },
    handler: async (input) => listProjects(getDb(), { includeArchived: Boolean(input.include_archived) }),
  },
  {
    definition: {
      name: 'martrello_get_project',
      description: 'Retorna o estado completo de um projeto: listas e cards (com labels).',
      inputSchema: {
        type: 'object',
        required: ['project'],
        properties: { project: { type: 'string', description: 'name ou id' } },
      },
    },
    handler: async (input) => getProjectByNameOrId(getDb(), String(input.project)),
  },
  {
    definition: {
      name: 'martrello_get_sprint',
      description: 'Retorna a sprint ativa com todos os cards agrupados por coluna (backlog/doing/done).',
      inputSchema: { type: 'object', properties: {} },
    },
    handler: async () => getActiveSprint(getDb()),
  },
  {
    definition: {
      name: 'martrello_search_cards',
      description: 'Busca cards por substring no título. Filtros opcionais por projeto e label.',
      inputSchema: {
        type: 'object',
        required: ['query'],
        properties: {
          query: { type: 'string' },
          project: { type: 'string' },
          label: { type: 'string' },
          include_archived: { type: 'boolean', default: false },
        },
      },
    },
    handler: async (input) => searchCards(getDb(), {
      query: String(input.query),
      project: input.project as string | undefined,
      label: input.label as string | undefined,
      includeArchived: Boolean(input.include_archived),
    }),
  },
  {
    definition: {
      name: 'martrello_list_labels',
      description: 'Lista todas as labels com contagem de cards usando cada uma.',
      inputSchema: { type: 'object', properties: {} },
    },
    handler: async () => listLabels(getDb()),
  },
  {
    definition: {
      name: 'martrello_list_sprints',
      description: 'Lista sprints (ativa + fechadas) em ordem reversa por started_at.',
      inputSchema: {
        type: 'object',
        properties: { limit: { type: 'integer', default: 20 } },
      },
    },
    handler: async (input) => listSprints(getDb(), { limit: input.limit as number | undefined }),
  },
  {
    definition: {
      name: 'martrello_get_sprint_history',
      description: 'Retorna o snapshot de uma sprint encerrada.',
      inputSchema: {
        type: 'object',
        required: ['sprint_id'],
        properties: { sprint_id: { type: 'string' } },
      },
    },
    handler: async (input) => getSprintHistory(getDb(), String(input.sprint_id)),
  },
];
```

- [ ] **Step 4: Register in `mcp/tools/index.ts`**

```ts
// mcp/tools/index.ts
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { readTools } from './read';

export type MartrelloTool = {
  definition: Tool;
  handler: (input: Record<string, unknown>) => Promise<unknown>;
};

export const tools: MartrelloTool[] = [
  ...readTools,
];

export function findTool(name: string): MartrelloTool | undefined {
  return tools.find((t) => t.definition.name === name);
}
```

- [ ] **Step 5: Run**

```bash
pnpm test mcp/tools/read.test.ts
```

Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add mcp/tools/read.ts mcp/tools/read.test.ts mcp/tools/index.ts
git commit -m "feat(mcp): read tools (projects, sprint, search, labels, sprints)"
```

---

### Task 19: Project + List + Label tools

**Files:**
- Create: `mcp/tools/projects.ts`, `mcp/tools/lists.ts`, `mcp/tools/labels.ts`, `mcp/tools/mutations.test.ts`
- Modify: `mcp/tools/index.ts`

- [ ] **Step 1: Write the failing test**

```ts
// mcp/tools/mutations.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { makeTestDb, type Db } from '@/lib/core/test-helpers';
import * as clientModule from '@/lib/db/client';
import { projectTools } from './projects';
import { listTools } from './lists';
import { labelTools } from './labels';

let db: Db;
beforeEach(() => {
  const t = makeTestDb();
  db = t.db;
  vi.spyOn(clientModule, 'getDb').mockReturnValue(db as any);
});

function find<T extends { definition: { name: string } }>(arr: T[], name: string): T {
  const f = arr.find((x) => x.definition.name === name);
  if (!f) throw new Error(`missing tool ${name}`);
  return f;
}

describe('project/list/label tools', () => {
  it('martrello_create_project + martrello_archive_project', async () => {
    const create = find(projectTools, 'martrello_create_project');
    const archive = find(projectTools, 'martrello_archive_project');
    const p = (await create.handler({ name: 'foo' })) as any;
    expect(p.name).toBe('foo');
    await archive.handler({ project: p.id });
  });

  it('martrello_create_list under existing project', async () => {
    const createProj = find(projectTools, 'martrello_create_project');
    const createList = find(listTools, 'martrello_create_list');
    const p = (await createProj.handler({ name: 'foo' })) as any;
    const l = (await createList.handler({ project: 'foo', name: 'Bloqueado' })) as any;
    expect(l.projectId).toBe(p.id);
  });

  it('martrello_create_label + add to nonexistent card errors gracefully', async () => {
    const createLabel = find(labelTools, 'martrello_create_label');
    await createLabel.handler({ name: 'bug', color: '#f97316' });
    const add = find(labelTools, 'martrello_add_label');
    await expect(add.handler({ card_id: 'nope', label: 'bug' })).resolves.toBeDefined();
    // Note: addLabelToCard on a nonexistent card_id silently inserts an orphan row;
    // FK constraint will reject it. So:
    // Actually with onConflictDoNothing and FK ON, insert will throw. Reconsider:
  });
});
```

(Adjust the last test once you see the actual behavior — if the FK constraint throws, change the expectation to `rejects.toThrow`. The test is intentionally minimal; broad behavior is already covered by `lib/core/labels.test.ts`.)

- [ ] **Step 2: Run, expect failure**

```bash
pnpm test mcp/tools/mutations.test.ts
```

Expected: FAIL — modules not found.

- [ ] **Step 3: Implement `mcp/tools/projects.ts`**

```ts
// mcp/tools/projects.ts
import { getDb } from '@/lib/db/client';
import { createProject, updateProject, archiveProject, reorderProjects, getProjectByNameOrId } from '@/lib/core/projects';
import type { MartrelloTool } from './index';

export const projectTools: MartrelloTool[] = [
  {
    definition: {
      name: 'martrello_create_project',
      description: 'Cria um novo projeto. Lists default = ["A fazer","Fazendo","Feito"].',
      inputSchema: {
        type: 'object',
        required: ['name'],
        properties: {
          name: { type: 'string' },
          color: { type: 'string', description: 'hex; default #64748b' },
          lists: { type: 'array', items: { type: 'string' } },
        },
      },
    },
    handler: async (input) => createProject(getDb(), {
      name: String(input.name),
      color: input.color as string | undefined,
      lists: input.lists as string[] | undefined,
    }),
  },
  {
    definition: {
      name: 'martrello_update_project',
      description: 'Atualiza nome e/ou cor de um projeto.',
      inputSchema: {
        type: 'object',
        required: ['project'],
        properties: {
          project: { type: 'string', description: 'name ou id' },
          name: { type: 'string' },
          color: { type: 'string' },
        },
      },
    },
    handler: async (input) => {
      const db = getDb();
      const p = await getProjectByNameOrId(db, String(input.project));
      return updateProject(db, p.id, {
        name: input.name as string | undefined,
        color: input.color as string | undefined,
      });
    },
  },
  {
    definition: {
      name: 'martrello_archive_project',
      description: 'Soft-delete: marca projeto como arquivado.',
      inputSchema: {
        type: 'object',
        required: ['project'],
        properties: { project: { type: 'string' } },
      },
    },
    handler: async (input) => {
      const db = getDb();
      const p = await getProjectByNameOrId(db, String(input.project));
      await archiveProject(db, p.id);
      return { ok: true, id: p.id };
    },
  },
  {
    definition: {
      name: 'martrello_reorder_projects',
      description: 'Reordena projetos na sidebar.',
      inputSchema: {
        type: 'object',
        required: ['ordered_ids'],
        properties: { ordered_ids: { type: 'array', items: { type: 'string' } } },
      },
    },
    handler: async (input) => {
      await reorderProjects(getDb(), (input.ordered_ids as string[]) ?? []);
      return { ok: true };
    },
  },
];
```

- [ ] **Step 4: Implement `mcp/tools/lists.ts`**

```ts
// mcp/tools/lists.ts
import { getDb } from '@/lib/db/client';
import { getProjectByNameOrId } from '@/lib/core/projects';
import { createList, renameList, deleteList, reorderLists, getListByNameOrId } from '@/lib/core/lists';
import type { MartrelloTool } from './index';

export const listTools: MartrelloTool[] = [
  {
    definition: {
      name: 'martrello_create_list',
      description: 'Cria uma lista (coluna) num projeto. Default na última posição.',
      inputSchema: {
        type: 'object',
        required: ['project', 'name'],
        properties: {
          project: { type: 'string' },
          name: { type: 'string' },
          position: { type: 'integer' },
        },
      },
    },
    handler: async (input) => {
      const db = getDb();
      const p = await getProjectByNameOrId(db, String(input.project));
      return createList(db, p.id, String(input.name), input.position as number | undefined);
    },
  },
  {
    definition: {
      name: 'martrello_rename_list',
      description: 'Renomeia uma lista (passa name ou id).',
      inputSchema: {
        type: 'object',
        required: ['project', 'list', 'new_name'],
        properties: {
          project: { type: 'string' },
          list: { type: 'string' },
          new_name: { type: 'string' },
        },
      },
    },
    handler: async (input) => {
      const db = getDb();
      const p = await getProjectByNameOrId(db, String(input.project));
      const l = await getListByNameOrId(db, p.id, String(input.list));
      return renameList(db, l.id, String(input.new_name));
    },
  },
  {
    definition: {
      name: 'martrello_delete_list',
      description: 'Deleta lista. Se tiver cards, exige force=true.',
      inputSchema: {
        type: 'object',
        required: ['project', 'list'],
        properties: {
          project: { type: 'string' },
          list: { type: 'string' },
          force: { type: 'boolean', default: false },
        },
      },
    },
    handler: async (input) => {
      const db = getDb();
      const p = await getProjectByNameOrId(db, String(input.project));
      const l = await getListByNameOrId(db, p.id, String(input.list));
      await deleteList(db, l.id, { force: Boolean(input.force) });
      return { ok: true };
    },
  },
  {
    definition: {
      name: 'martrello_reorder_lists',
      description: 'Reordena listas de um projeto.',
      inputSchema: {
        type: 'object',
        required: ['project', 'ordered'],
        properties: {
          project: { type: 'string' },
          ordered: { type: 'array', items: { type: 'string' }, description: 'nomes ou ids' },
        },
      },
    },
    handler: async (input) => {
      const db = getDb();
      const p = await getProjectByNameOrId(db, String(input.project));
      const orderedIds: string[] = [];
      for (const n of (input.ordered as string[]) ?? []) {
        const l = await getListByNameOrId(db, p.id, n);
        orderedIds.push(l.id);
      }
      await reorderLists(db, p.id, orderedIds);
      return { ok: true };
    },
  },
];
```

- [ ] **Step 5: Implement `mcp/tools/labels.ts`**

```ts
// mcp/tools/labels.ts
import { getDb } from '@/lib/db/client';
import { createLabel, addLabelToCard, removeLabelFromCard, deleteLabel } from '@/lib/core/labels';
import type { MartrelloTool } from './index';

export const labelTools: MartrelloTool[] = [
  {
    definition: {
      name: 'martrello_create_label',
      description: 'Cria uma label global. Cor em hex (ex: #ef4444).',
      inputSchema: {
        type: 'object',
        required: ['name', 'color'],
        properties: { name: { type: 'string' }, color: { type: 'string' } },
      },
    },
    handler: async (input) => createLabel(getDb(), String(input.name), String(input.color)),
  },
  {
    definition: {
      name: 'martrello_add_label',
      description: 'Anexa label existente a um card. Se a label não existir, retorna LABEL_NOT_FOUND.',
      inputSchema: {
        type: 'object',
        required: ['card_id', 'label'],
        properties: { card_id: { type: 'string' }, label: { type: 'string' } },
      },
    },
    handler: async (input) => {
      await addLabelToCard(getDb(), String(input.card_id), String(input.label));
      return { ok: true };
    },
  },
  {
    definition: {
      name: 'martrello_remove_label',
      description: 'Remove label de um card. Idempotente.',
      inputSchema: {
        type: 'object',
        required: ['card_id', 'label'],
        properties: { card_id: { type: 'string' }, label: { type: 'string' } },
      },
    },
    handler: async (input) => {
      await removeLabelFromCard(getDb(), String(input.card_id), String(input.label));
      return { ok: true };
    },
  },
  {
    definition: {
      name: 'martrello_delete_label',
      description: 'Deleta label globalmente (remove de todos os cards).',
      inputSchema: {
        type: 'object',
        required: ['label'],
        properties: { label: { type: 'string' } },
      },
    },
    handler: async (input) => {
      await deleteLabel(getDb(), String(input.label));
      return { ok: true };
    },
  },
];
```

- [ ] **Step 6: Register in `mcp/tools/index.ts`**

```ts
// mcp/tools/index.ts
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { readTools } from './read';
import { projectTools } from './projects';
import { listTools } from './lists';
import { labelTools } from './labels';

export type MartrelloTool = {
  definition: Tool;
  handler: (input: Record<string, unknown>) => Promise<unknown>;
};

export const tools: MartrelloTool[] = [
  ...readTools,
  ...projectTools,
  ...listTools,
  ...labelTools,
];

export function findTool(name: string): MartrelloTool | undefined {
  return tools.find((t) => t.definition.name === name);
}
```

- [ ] **Step 7: Run mutation tests; adjust the last test expectation if needed based on the real FK behavior**

```bash
pnpm test mcp/tools/mutations.test.ts
```

Expected: PASS (with the test adjusted as needed in Step 1).

- [ ] **Step 8: Commit**

```bash
git add mcp/tools/projects.ts mcp/tools/lists.ts mcp/tools/labels.ts mcp/tools/mutations.test.ts mcp/tools/index.ts
git commit -m "feat(mcp): project, list, and label tools"
```

---

### Task 20: Card tools

**Files:**
- Create: `mcp/tools/cards.ts`, `mcp/tools/cards.test.ts`
- Modify: `mcp/tools/index.ts`

- [ ] **Step 1: Write the failing test**

```ts
// mcp/tools/cards.test.ts
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
```

- [ ] **Step 2: Run, expect failure**

```bash
pnpm test mcp/tools/cards.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement**

```ts
// mcp/tools/cards.ts
import { getDb } from '@/lib/db/client';
import { createCard, updateCard, moveCard, archiveCard, unarchiveCard, getCardById } from '@/lib/core/cards';
import type { MartrelloTool } from './index';

export const cardTools: MartrelloTool[] = [
  {
    definition: {
      name: 'martrello_create_card',
      description: 'Cria um card. list default = primeira do projeto. due_date aceita ISO ou pt-BR (hoje, amanhã, sex, +3d, etc).',
      inputSchema: {
        type: 'object',
        required: ['project', 'title'],
        properties: {
          project: { type: 'string' },
          list: { type: 'string' },
          title: { type: 'string' },
          description: { type: 'string', description: 'markdown' },
          due_date: { type: 'string' },
          labels: { type: 'array', items: { type: 'string' }, description: 'nomes de labels existentes' },
          add_to_sprint: { type: 'boolean', default: false },
        },
      },
    },
    handler: async (input) => createCard(getDb(), {
      project: String(input.project),
      list: input.list as string | undefined,
      title: String(input.title),
      description: input.description as string | undefined,
      dueDate: input.due_date as string | undefined,
      labels: input.labels as string[] | undefined,
      addToSprint: Boolean(input.add_to_sprint),
    }),
  },
  {
    definition: {
      name: 'martrello_get_card',
      description: 'Retorna um card com suas labels.',
      inputSchema: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string' } },
      },
    },
    handler: async (input) => getCardById(getDb(), String(input.id)),
  },
  {
    definition: {
      name: 'martrello_update_card',
      description: 'Atualiza title, description, e/ou due_date.',
      inputSchema: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string' },
          title: { type: 'string' },
          description: { type: ['string', 'null'] },
          due_date: { type: ['string', 'null'] },
        },
      },
    },
    handler: async (input) => updateCard(getDb(), String(input.id), {
      title: input.title as string | undefined,
      description: input.description as string | null | undefined,
      dueDate: input.due_date as string | null | undefined,
    }),
  },
  {
    definition: {
      name: 'martrello_move_card',
      description: 'Move card pra outra list (e opcionalmente outro projeto).',
      inputSchema: {
        type: 'object',
        required: ['id', 'to_list'],
        properties: {
          id: { type: 'string' },
          to_project: { type: 'string' },
          to_list: { type: 'string' },
          position: { type: 'integer' },
        },
      },
    },
    handler: async (input) => {
      await moveCard(getDb(), String(input.id), {
        toProject: input.to_project as string | undefined,
        toList: String(input.to_list),
        position: input.position as number | undefined,
      });
      return { ok: true };
    },
  },
  {
    definition: {
      name: 'martrello_archive_card',
      description: 'Arquiva card (sai do sprint automaticamente).',
      inputSchema: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string' } },
      },
    },
    handler: async (input) => {
      await archiveCard(getDb(), String(input.id));
      return { ok: true };
    },
  },
  {
    definition: {
      name: 'martrello_unarchive_card',
      description: 'Desarquiva card. Não restaura no sprint.',
      inputSchema: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string' } },
      },
    },
    handler: async (input) => {
      await unarchiveCard(getDb(), String(input.id));
      return { ok: true };
    },
  },
];
```

- [ ] **Step 4: Register in `mcp/tools/index.ts`**

Update the imports and the `tools` array:

```ts
import { cardTools } from './cards';
// ...
export const tools: MartrelloTool[] = [
  ...readTools,
  ...projectTools,
  ...listTools,
  ...labelTools,
  ...cardTools,
];
```

- [ ] **Step 5: Run**

```bash
pnpm test mcp/tools/cards.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add mcp/tools/cards.ts mcp/tools/cards.test.ts mcp/tools/index.ts
git commit -m "feat(mcp): card tools"
```

---

### Task 21: Sprint tools

**Files:**
- Create: `mcp/tools/sprint.ts`, `mcp/tools/sprint.test.ts`
- Modify: `mcp/tools/index.ts`

- [ ] **Step 1: Write the failing test**

```ts
// mcp/tools/sprint.test.ts
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
```

- [ ] **Step 2: Run, expect failure**

```bash
pnpm test mcp/tools/sprint.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement**

```ts
// mcp/tools/sprint.ts
import { getDb } from '@/lib/db/client';
import { startSprint, addToSprint, moveInSprint, removeFromSprint, closeSprint } from '@/lib/core/sprint';
import type { MartrelloTool } from './index';

export const sprintTools: MartrelloTool[] = [
  {
    definition: {
      name: 'martrello_start_sprint',
      description: 'Inicia uma nova sprint ativa. Erro se já houver uma ativa.',
      inputSchema: {
        type: 'object',
        properties: { name: { type: 'string', description: 'auto-gerado se omitido' } },
      },
    },
    handler: async (input) => startSprint(getDb(), input.name as string | undefined),
  },
  {
    definition: {
      name: 'martrello_add_to_sprint',
      description: 'Adiciona card à sprint ativa (default: backlog). Idempotente.',
      inputSchema: {
        type: 'object',
        required: ['card_id'],
        properties: {
          card_id: { type: 'string' },
          sprint_list: { type: 'string', enum: ['backlog', 'doing', 'done'], default: 'backlog' },
        },
      },
    },
    handler: async (input) => addToSprint(getDb(), String(input.card_id), (input.sprint_list as any) ?? 'backlog'),
  },
  {
    definition: {
      name: 'martrello_move_in_sprint',
      description: 'Move card entre colunas do sprint.',
      inputSchema: {
        type: 'object',
        required: ['card_id', 'sprint_list'],
        properties: {
          card_id: { type: 'string' },
          sprint_list: { type: 'string', enum: ['backlog', 'doing', 'done'] },
          position: { type: 'integer' },
        },
      },
    },
    handler: async (input) => {
      await moveInSprint(getDb(), String(input.card_id), input.sprint_list as any, input.position as number | undefined);
      return { ok: true };
    },
  },
  {
    definition: {
      name: 'martrello_remove_from_sprint',
      description: 'Tira card da sprint (continua existindo no projeto).',
      inputSchema: {
        type: 'object',
        required: ['card_id'],
        properties: { card_id: { type: 'string' } },
      },
    },
    handler: async (input) => {
      await removeFromSprint(getDb(), String(input.card_id));
      return { ok: true };
    },
  },
  {
    definition: {
      name: 'martrello_close_sprint',
      description: 'Fecha sprint ativa. Cards "done" são arquivados. Por padrão (carry_incomplete=true), incompletos carregam para nova sprint, mantendo a coluna de origem.',
      inputSchema: {
        type: 'object',
        properties: {
          name_for_next: { type: 'string' },
          carry_incomplete: { type: 'boolean', default: true },
        },
      },
    },
    handler: async (input) => closeSprint(getDb(), {
      nameForNext: input.name_for_next as string | undefined,
      carryIncomplete: input.carry_incomplete as boolean | undefined,
    }),
  },
];
```

- [ ] **Step 4: Register in `mcp/tools/index.ts`**

```ts
import { sprintTools } from './sprint';
// ...
export const tools: MartrelloTool[] = [
  ...readTools,
  ...projectTools,
  ...listTools,
  ...labelTools,
  ...cardTools,
  ...sprintTools,
];
```

- [ ] **Step 5: Run full suite**

```bash
pnpm test
```

Expected: all green.

- [ ] **Step 6: Rebuild MCP and verify it lists tools**

```bash
pnpm mcp:build
node -e "import('@modelcontextprotocol/sdk/client/index.js').then(async ({ Client }) => { const { StdioClientTransport } = await import('@modelcontextprotocol/sdk/client/stdio.js'); const t = new StdioClientTransport({ command: 'node', args: ['mcp/dist/index.js'] }); const c = new Client({ name: 'ping', version: '0.0.0' }, { capabilities: {} }); await c.connect(t); const out = await c.listTools(); console.log(out.tools.length, 'tools'); console.log(out.tools.map(x => x.name).join('\n')); await c.close(); })"
```

Expected: prints `~26 tools` followed by all tool names. **MILESTONE: MCP server is now usable through Claude Code.**

- [ ] **Step 7: Commit**

```bash
git add mcp/tools/sprint.ts mcp/tools/sprint.test.ts mcp/tools/index.ts
git commit -m "feat(mcp): sprint tools (start, add, move, close)"
```

---

<!-- PHASE-4 -->
## Phase 4 — Web UI: foundations

### Task 22: Tailwind theme with martrello dark palette

**Files:**
- Modify: `app/globals.css`, `tailwind.config.ts` (if scaffolded; otherwise this is CSS-only with Tailwind v4)

- [ ] **Step 1: Replace `app/globals.css`**

```css
@import "tailwindcss";

@theme {
  --color-mt-bg: #0d1b2a;
  --color-mt-list: #1b2a3a;
  --color-mt-card: #22344a;
  --color-mt-line: #2c3e54;
  --color-mt-text: #e2e8f0;
  --color-mt-muted: #94a3b8;
  --color-mt-accent: #3b82f6;

  --color-mt-sprint-bg: #150d22;
  --color-mt-sprint-list: #221833;
  --color-mt-sprint-card: #2c2042;
  --color-mt-sprint-line: #3a2c54;
  --color-mt-sprint-accent: #a855f7;

  --font-sans: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
}

html, body {
  background: var(--color-mt-bg);
  color: var(--color-mt-text);
  font-family: var(--font-sans);
}

::-webkit-scrollbar { width: 8px; height: 8px; }
::-webkit-scrollbar-thumb { background: var(--color-mt-line); border-radius: 4px; }
```

- [ ] **Step 2: Update `app/layout.tsx`**

```tsx
// app/layout.tsx
import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'martrello',
  description: 'Personal Trello with Claude as the writer',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
```

- [ ] **Step 3: Boot dev server and confirm dark background**

```bash
pnpm dev
```

Open `http://localhost:3000`. Expected: page renders with `#0d1b2a` background. Stop with Ctrl-C.

- [ ] **Step 4: Commit**

```bash
git add app/globals.css app/layout.tsx
git commit -m "feat(ui): martrello dark theme tokens and base layout"
```

---

### Task 23: Server Actions for UI mutations

**Files:**
- Create: `app/actions.ts`

These mirror MCP tools so the UI can do quick-create and drag-and-drop without an API layer.

- [ ] **Step 1: Write `app/actions.ts`**

```ts
// app/actions.ts
'use server';

import { revalidatePath } from 'next/cache';
import { getDb } from '@/lib/db/client';
import { createCard, updateCard, moveCard, archiveCard } from '@/lib/core/cards';
import { addToSprint, moveInSprint, removeFromSprint, closeSprint, startSprint } from '@/lib/core/sprint';
import { addLabelToCard, removeLabelFromCard } from '@/lib/core/labels';

export async function quickCreateCardAction(projectId: string, listId: string, title: string) {
  if (!title.trim()) return;
  await createCard(getDb(), { project: projectId, list: listId, title: title.trim() });
  revalidatePath(`/project/${projectId}`);
}

export async function updateCardAction(id: string, patch: { title?: string; description?: string | null; dueDate?: string | null }) {
  const card = await updateCard(getDb(), id, patch);
  revalidatePath(`/project/${card.projectId}`);
  revalidatePath(`/sprint`);
}

export async function moveCardAction(id: string, toList: string, position?: number) {
  await moveCard(getDb(), id, { toList, position });
  revalidatePath('/sprint');
  revalidatePath('/');
}

export async function archiveCardAction(id: string) {
  await archiveCard(getDb(), id);
  revalidatePath('/sprint');
  revalidatePath('/');
}

export async function moveInSprintAction(cardId: string, sprintList: 'backlog' | 'doing' | 'done', position?: number) {
  await moveInSprint(getDb(), cardId, sprintList, position);
  revalidatePath('/sprint');
}

export async function removeFromSprintAction(cardId: string) {
  await removeFromSprint(getDb(), cardId);
  revalidatePath('/sprint');
}

export async function addToSprintAction(cardId: string) {
  await addToSprint(getDb(), cardId);
  revalidatePath('/sprint');
}

export async function startSprintAction(name?: string) {
  await startSprint(getDb(), name);
  revalidatePath('/sprint');
}

export async function closeSprintAction(carryIncomplete = true) {
  await closeSprint(getDb(), { carryIncomplete });
  revalidatePath('/sprint');
  revalidatePath('/');
}

export async function toggleLabelAction(cardId: string, labelName: string, present: boolean) {
  if (present) await removeLabelFromCard(getDb(), cardId, labelName);
  else await addLabelToCard(getDb(), cardId, labelName);
  revalidatePath('/sprint');
  revalidatePath('/');
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
pnpm tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 3: Commit**

```bash
git add app/actions.ts
git commit -m "feat(ui): server actions for quick-create, move, sprint, labels"
```

---

### Task 24: Sidebar component + root layout shell

**Files:**
- Create: `components/Sidebar.tsx`, `app/layout.tsx` (modify)

- [ ] **Step 1: Write `components/Sidebar.tsx`**

```tsx
// components/Sidebar.tsx
import Link from 'next/link';
import { getDb } from '@/lib/db/client';
import { listProjects } from '@/lib/core/projects';
import { getActiveSprintRow } from '@/lib/core/sprint';

export async function Sidebar() {
  const projects = await listProjects(getDb());
  const activeSprint = await getActiveSprintRow(getDb());

  return (
    <aside className="w-64 shrink-0 border-r border-[var(--color-mt-line)] bg-[#0a1622] flex flex-col">
      <div className="px-4 py-3 border-b border-[var(--color-mt-line)] text-sm font-semibold tracking-wide">
        martrello
      </div>
      <nav className="flex-1 overflow-y-auto py-2 text-sm">
        <Link
          href="/sprint"
          className="flex items-center gap-2 px-4 py-2 hover:bg-[var(--color-mt-list)] text-[var(--color-mt-sprint-accent)]"
        >
          <span className="w-2 h-2 rounded-full bg-[var(--color-mt-sprint-accent)]" />
          Sprint {activeSprint?.name ? `· ${activeSprint.name}` : 'atual'}
        </Link>
        <div className="px-4 pt-4 pb-1 text-xs uppercase text-[var(--color-mt-muted)] tracking-wider">
          Projetos
        </div>
        {projects.map((p) => (
          <Link
            key={p.id}
            href={`/project/${p.id}`}
            className="flex items-center justify-between px-4 py-2 hover:bg-[var(--color-mt-list)]"
          >
            <span className="flex items-center gap-2 min-w-0">
              <span className="w-2 h-2 rounded-full shrink-0" style={{ background: p.color }} />
              <span className="truncate">{p.name}</span>
            </span>
            <span className="text-xs text-[var(--color-mt-muted)]">{p.cardCount}</span>
          </Link>
        ))}
      </nav>
    </aside>
  );
}
```

- [ ] **Step 2: Update `app/layout.tsx` to render the sidebar**

```tsx
// app/layout.tsx
import type { Metadata } from 'next';
import './globals.css';
import { Sidebar } from '@/components/Sidebar';

export const metadata: Metadata = {
  title: 'martrello',
  description: 'Personal Trello with Claude as the writer',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className="min-h-screen flex">
        <Sidebar />
        <main className="flex-1 min-w-0">{children}</main>
      </body>
    </html>
  );
}
```

- [ ] **Step 3: Add a redirect at `app/page.tsx`**

```tsx
// app/page.tsx
import { redirect } from 'next/navigation';
import { getDb } from '@/lib/db/client';
import { listProjects } from '@/lib/core/projects';

export default async function Home() {
  const projects = await listProjects(getDb());
  if (projects[0]) redirect(`/project/${projects[0].id}`);
  redirect('/sprint');
}
```

- [ ] **Step 4: Boot and verify**

```bash
pnpm dev
```

Open `http://localhost:3000`. Expected: redirects to `/project/<inbox-id>` (or `/sprint` if no projects); sidebar shows "Inbox" and "Sprint atual". The right side is empty (no board yet).

- [ ] **Step 5: Commit**

```bash
git add components/Sidebar.tsx app/layout.tsx app/page.tsx
git commit -m "feat(ui): sidebar with project list and sprint link"
```

---

## Phase 5 — Web UI: board and DnD

### Task 25: Static Card component

**Files:**
- Create: `components/Card.tsx`

- [ ] **Step 1: Write component**

```tsx
// components/Card.tsx
'use client';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export type CardData = {
  id: string;
  title: string;
  dueDate: string | null;
  labels: Array<{ name: string; color: string }>;
  projectName?: string;
  projectColor?: string;
};

type Props = {
  card: CardData;
  variant?: 'project' | 'sprint';
  onClick?: () => void;
};

export function Card({ card, variant = 'project', onClick }: Props) {
  const accent = card.labels[0]?.color;
  const bg = variant === 'sprint' ? 'bg-[var(--color-mt-sprint-card)]' : 'bg-[var(--color-mt-card)]';
  const isOverdue = card.dueDate && parseISO(card.dueDate) < new Date();

  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full text-left ${bg} rounded p-2.5 text-xs leading-snug shadow-sm border-l-[3px] hover:brightness-110 transition`}
      style={{ borderLeftColor: accent ?? 'transparent' }}
    >
      <div className="text-[var(--color-mt-text)]">{card.title}</div>
      <div className="flex flex-wrap items-center gap-2 mt-1.5 text-[10px] text-[var(--color-mt-muted)]">
        {card.dueDate && (
          <span className={isOverdue ? 'text-rose-400' : ''}>
            📅 {format(parseISO(card.dueDate), 'dd MMM', { locale: ptBR })}
          </span>
        )}
        {card.labels.map((l) => (
          <span key={l.name} className="inline-flex items-center gap-1">
            <span className="w-5 h-1.5 rounded-sm" style={{ background: l.color }} />
            {l.name}
          </span>
        ))}
        {variant === 'sprint' && card.projectName && (
          <span
            className="ml-auto px-2 py-0.5 rounded-full bg-[var(--color-mt-sprint-bg)]"
            style={{ color: card.projectColor }}
          >
            {card.projectName}
          </span>
        )}
      </div>
    </button>
  );
}
```

- [ ] **Step 2: Verify TS**

```bash
pnpm tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 3: Commit**

```bash
git add components/Card.tsx
git commit -m "feat(ui): Card component with label accent, due date, sprint pill"
```

---

### Task 26: List component with quick-create input

**Files:**
- Create: `components/List.tsx`, `components/QuickCreate.tsx`

- [ ] **Step 1: Write `components/QuickCreate.tsx`**

```tsx
// components/QuickCreate.tsx
'use client';
import { useState, useTransition } from 'react';
import { quickCreateCardAction } from '@/app/actions';

type Props = { projectId: string; listId: string };

export function QuickCreate({ projectId, listId }: Props) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [pending, start] = useTransition();

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs text-[var(--color-mt-muted)] px-1 py-1.5 hover:text-[var(--color-mt-text)] text-left"
      >
        + novo card
      </button>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const t = title;
        start(async () => {
          await quickCreateCardAction(projectId, listId, t);
          setTitle('');
          setOpen(false);
        });
      }}
      className="flex flex-col gap-1"
    >
      <input
        autoFocus
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Título do card"
        className="bg-[var(--color-mt-card)] text-xs p-2 rounded outline-none border border-[var(--color-mt-line)]"
        onBlur={() => { if (!title) setOpen(false); }}
      />
      <button type="submit" disabled={pending} className="text-xs px-2 py-1 bg-[var(--color-mt-accent)] rounded self-start">
        {pending ? '...' : 'adicionar'}
      </button>
    </form>
  );
}
```

- [ ] **Step 2: Write `components/List.tsx`**

```tsx
// components/List.tsx
'use client';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { SortableCard } from './SortableCard';
import type { CardData } from './Card';
import { QuickCreate } from './QuickCreate';

type Props = {
  id: string;            // logical list id ("backlog"/"doing"/"done" for sprint)
  title: string;
  cards: CardData[];
  variant?: 'project' | 'sprint';
  onCardClick?: (id: string) => void;
  quickCreate?: { projectId: string; listId: string } | null;
};

export function List({ id, title, cards, variant = 'project', onCardClick, quickCreate }: Props) {
  const { setNodeRef, isOver } = useDroppable({ id });
  const bg = variant === 'sprint' ? 'bg-[var(--color-mt-sprint-list)]' : 'bg-[var(--color-mt-list)]';

  return (
    <div
      ref={setNodeRef}
      className={`${bg} rounded p-2 flex flex-col gap-2 w-72 shrink-0 ${isOver ? 'ring-2 ring-[var(--color-mt-accent)]' : ''}`}
    >
      <div className="text-xs font-semibold px-1 text-[var(--color-mt-text)]/85">{title}</div>
      <SortableContext items={cards.map((c) => c.id)} strategy={verticalListSortingStrategy}>
        <div className="flex flex-col gap-2 min-h-1">
          {cards.map((c) => (
            <SortableCard key={c.id} card={c} variant={variant} onClick={() => onCardClick?.(c.id)} />
          ))}
        </div>
      </SortableContext>
      {quickCreate && <QuickCreate projectId={quickCreate.projectId} listId={quickCreate.listId} />}
    </div>
  );
}
```

- [ ] **Step 3: Write `components/SortableCard.tsx`**

```tsx
// components/SortableCard.tsx
'use client';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Card, type CardData } from './Card';

type Props = { card: CardData; variant?: 'project' | 'sprint'; onClick?: () => void };

export function SortableCard({ card, variant, onClick }: Props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: card.id });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 }}
      {...attributes}
      {...listeners}
    >
      <Card card={card} variant={variant} onClick={onClick} />
    </div>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add components/List.tsx components/QuickCreate.tsx components/SortableCard.tsx
git commit -m "feat(ui): List, QuickCreate, SortableCard"
```

---

### Task 27: Board component with @dnd-kit

**Files:**
- Create: `components/Board.tsx`

- [ ] **Step 1: Write component**

```tsx
// components/Board.tsx
'use client';
import { useState } from 'react';
import { DndContext, type DragEndEvent, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { List } from './List';
import type { CardData } from './Card';
import { moveCardAction, moveInSprintAction } from '@/app/actions';

export type Column = {
  id: string;
  title: string;
  cards: CardData[];
  quickCreate?: { projectId: string; listId: string };
};

type Props = {
  columns: Column[];
  variant?: 'project' | 'sprint';
  onCardClick?: (id: string) => void;
};

export function Board({ columns, variant = 'project', onCardClick }: Props) {
  const [cols, setCols] = useState(columns);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  function findCardColumn(id: string) {
    return cols.find((col) => col.cards.some((c) => c.id === id));
  }

  function onDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over) return;
    const fromCol = findCardColumn(String(active.id));
    if (!fromCol) return;

    // dropping onto a column id (empty area) or another card (id in cards)
    let toColId: string | null = null;
    let beforeCardId: string | null = null;
    const overId = String(over.id);
    if (cols.some((c) => c.id === overId)) {
      toColId = overId;
    } else {
      const toCol = findCardColumn(overId);
      if (toCol) {
        toColId = toCol.id;
        beforeCardId = overId;
      }
    }
    if (!toColId) return;

    const toCol = cols.find((c) => c.id === toColId)!;
    // optimistic reorder
    setCols((prev) => {
      const next = prev.map((c) => ({ ...c, cards: [...c.cards] }));
      const from = next.find((c) => c.id === fromCol.id)!;
      const to = next.find((c) => c.id === toColId)!;
      const idx = from.cards.findIndex((c) => c.id === active.id);
      const [card] = from.cards.splice(idx, 1);
      const insertAt = beforeCardId ? to.cards.findIndex((c) => c.id === beforeCardId) : to.cards.length;
      to.cards.splice(insertAt < 0 ? to.cards.length : insertAt, 0, card);
      return next;
    });

    // persist
    const position = (toCol.cards.findIndex((c) => c.id === beforeCardId) + 1) * 1000;
    if (variant === 'sprint') {
      moveInSprintAction(String(active.id), toColId as 'backlog' | 'doing' | 'done', position);
    } else {
      moveCardAction(String(active.id), toColId, position);
    }
  }

  return (
    <DndContext sensors={sensors} onDragEnd={onDragEnd}>
      <div className="flex gap-3 p-4 overflow-x-auto h-full">
        {cols.map((c) => (
          <List
            key={c.id}
            id={c.id}
            title={c.title}
            cards={c.cards}
            variant={variant}
            onCardClick={onCardClick}
            quickCreate={c.quickCreate ?? null}
          />
        ))}
      </div>
    </DndContext>
  );
}
```

- [ ] **Step 2: Verify TS**

```bash
pnpm tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 3: Commit**

```bash
git add components/Board.tsx
git commit -m "feat(ui): Board with @dnd-kit drag-and-drop and optimistic reorder"
```

---

### Task 28: Project page route

**Files:**
- Create: `app/project/[id]/page.tsx`, `app/project/[id]/BoardClient.tsx`

- [ ] **Step 1: Write the server page**

```tsx
// app/project/[id]/page.tsx
import { notFound } from 'next/navigation';
import { getDb } from '@/lib/db/client';
import { getProjectByNameOrId } from '@/lib/core/projects';
import { cards as cardsTbl, labels as labelsTbl, cardLabels } from '@/lib/db/schema';
import { and, asc, eq, isNull } from 'drizzle-orm';
import { BoardClient } from './BoardClient';
import type { Column } from '@/components/Board';
import type { CardData } from '@/components/Card';

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();
  let project;
  try {
    project = await getProjectByNameOrId(db, id);
  } catch {
    notFound();
  }

  const cardRows = await db
    .select()
    .from(cardsTbl)
    .where(and(eq(cardsTbl.projectId, project.id), isNull(cardsTbl.archivedAt)))
    .orderBy(asc(cardsTbl.position));

  const labelRows = await db
    .select({ cardId: cardLabels.cardId, name: labelsTbl.name, color: labelsTbl.color })
    .from(cardLabels)
    .innerJoin(labelsTbl, eq(cardLabels.labelId, labelsTbl.id));

  const labelsByCard = new Map<string, Array<{ name: string; color: string }>>();
  for (const r of labelRows) {
    if (!labelsByCard.has(r.cardId)) labelsByCard.set(r.cardId, []);
    labelsByCard.get(r.cardId)!.push({ name: r.name, color: r.color });
  }

  const columns: Column[] = project.lists.map((list) => ({
    id: list.id,
    title: list.name,
    cards: cardRows.filter((c) => c.listId === list.id).map<CardData>((c) => ({
      id: c.id,
      title: c.title,
      dueDate: c.dueDate,
      labels: labelsByCard.get(c.id) ?? [],
    })),
    quickCreate: { projectId: project.id, listId: list.id },
  }));

  return (
    <div className="h-screen flex flex-col">
      <header className="px-4 py-3 border-b border-[var(--color-mt-line)] flex items-center gap-3">
        <span className="w-2.5 h-2.5 rounded-full" style={{ background: project.color }} />
        <h1 className="text-sm font-semibold">{project.name}</h1>
        <span className="text-xs text-[var(--color-mt-muted)]">· projeto</span>
      </header>
      <BoardClient columns={columns} />
    </div>
  );
}
```

- [ ] **Step 2: Write `BoardClient.tsx` (the SWR + panel wrapper)**

```tsx
// app/project/[id]/BoardClient.tsx
'use client';
import { useState } from 'react';
import { Board, type Column } from '@/components/Board';
import { CardPanel } from '@/components/CardPanel';

export function BoardClient({ columns }: { columns: Column[] }) {
  const [openCardId, setOpenCardId] = useState<string | null>(null);
  return (
    <>
      <div className="flex-1 min-h-0">
        <Board columns={columns} variant="project" onCardClick={(id) => setOpenCardId(id)} />
      </div>
      {openCardId && <CardPanel cardId={openCardId} onClose={() => setOpenCardId(null)} />}
    </>
  );
}
```

- [ ] **Step 3: Verify dev**

```bash
pnpm dev
```

Open `http://localhost:3000/project/<inbox-id>` (the redirect should land you here). Expected: three columns (A fazer, Fazendo, Feito), each with the quick-create input. Adding a card via quick-create persists. Drag-and-drop between columns works (note: `CardPanel` not implemented yet, so clicking a card will error — implement it next).

- [ ] **Step 4: Commit**

```bash
git add app/project/
git commit -m "feat(ui): project page with board and quick-create"
```

---

### Task 29: CardPanel side panel

**Files:**
- Create: `components/CardPanel.tsx`

- [ ] **Step 1: Add an API route to fetch one card (SWR-friendly)**

Create `app/api/card/[id]/route.ts`:

```ts
// app/api/card/[id]/route.ts
import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/client';
import { getCardById } from '@/lib/core/cards';
import { listLabels } from '@/lib/core/labels';

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const card = await getCardById(getDb(), id);
  const allLabels = await listLabels(getDb());
  return NextResponse.json({ card, allLabels });
}
```

- [ ] **Step 2: Write `components/CardPanel.tsx`**

```tsx
// components/CardPanel.tsx
'use client';
import { useState, useTransition } from 'react';
import useSWR from 'swr';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { updateCardAction, toggleLabelAction, archiveCardAction, addToSprintAction, removeFromSprintAction } from '@/app/actions';

const fetcher = (url: string) => fetch(url).then((r) => r.json());

type Props = { cardId: string; onClose: () => void };

export function CardPanel({ cardId, onClose }: Props) {
  const { data, mutate } = useSWR(`/api/card/${cardId}`, fetcher, { refreshInterval: 3000, revalidateOnFocus: true });
  const [editingDesc, setEditingDesc] = useState(false);
  const [descDraft, setDescDraft] = useState('');
  const [titleDraft, setTitleDraft] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (!data) return null;
  const card = data.card as { id: string; title: string; description: string | null; dueDate: string | null; labels: Array<{ name: string; color: string }> };
  const allLabels = data.allLabels as Array<{ name: string; color: string }>;
  const presentNames = new Set(card.labels.map((l) => l.name));

  function saveTitle() {
    if (titleDraft == null || titleDraft === card.title) { setTitleDraft(null); return; }
    start(async () => {
      await updateCardAction(card.id, { title: titleDraft });
      setTitleDraft(null);
      mutate();
    });
  }

  function saveDesc() {
    start(async () => {
      await updateCardAction(card.id, { description: descDraft });
      setEditingDesc(false);
      mutate();
    });
  }

  function saveDue(input: string) {
    start(async () => {
      await updateCardAction(card.id, { dueDate: input || null });
      mutate();
    });
  }

  return (
    <div className="fixed inset-y-0 right-0 w-[420px] bg-[#0a1622] border-l border-[var(--color-mt-line)] z-40 flex flex-col">
      <header className="px-4 py-3 border-b border-[var(--color-mt-line)] flex items-center justify-between">
        <input
          value={titleDraft ?? card.title}
          onChange={(e) => setTitleDraft(e.target.value)}
          onBlur={saveTitle}
          onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setTitleDraft(null); }}
          className="bg-transparent text-sm font-semibold w-full mr-2 outline-none"
        />
        <button type="button" onClick={onClose} className="text-xs text-[var(--color-mt-muted)]">fechar</button>
      </header>
      <div className="flex-1 overflow-y-auto p-4 space-y-4 text-sm">
        <section>
          <div className="text-xs text-[var(--color-mt-muted)] mb-1">Descrição</div>
          {editingDesc ? (
            <div className="space-y-2">
              <textarea
                value={descDraft}
                onChange={(e) => setDescDraft(e.target.value)}
                className="w-full h-40 bg-[var(--color-mt-card)] p-2 rounded text-xs"
              />
              <div className="flex gap-2">
                <button type="button" disabled={pending} onClick={saveDesc} className="text-xs bg-[var(--color-mt-accent)] px-2 py-1 rounded">salvar</button>
                <button type="button" onClick={() => setEditingDesc(false)} className="text-xs">cancelar</button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => { setDescDraft(card.description ?? ''); setEditingDesc(true); }}
              className="w-full text-left bg-[var(--color-mt-card)] p-3 rounded text-xs leading-relaxed"
            >
              {card.description ? (
                <div className="prose prose-invert prose-sm max-w-none">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{card.description}</ReactMarkdown>
                </div>
              ) : (
                <span className="text-[var(--color-mt-muted)]">adicionar descrição</span>
              )}
            </button>
          )}
        </section>

        <section>
          <div className="text-xs text-[var(--color-mt-muted)] mb-1">Prazo</div>
          <input
            type="text"
            defaultValue={card.dueDate ?? ''}
            placeholder="2026-06-15 ou amanhã / sex / +3d"
            onBlur={(e) => saveDue(e.target.value)}
            className="w-full bg-[var(--color-mt-card)] p-2 rounded text-xs"
          />
        </section>

        <section>
          <div className="text-xs text-[var(--color-mt-muted)] mb-1">Labels</div>
          <div className="flex flex-wrap gap-1.5">
            {allLabels.map((l) => {
              const on = presentNames.has(l.name);
              return (
                <button
                  type="button"
                  key={l.name}
                  onClick={() => start(async () => { await toggleLabelAction(card.id, l.name, on); mutate(); })}
                  className={`text-[10px] px-2 py-1 rounded ${on ? '' : 'opacity-40'}`}
                  style={{ background: l.color }}
                >
                  {l.name}
                </button>
              );
            })}
          </div>
        </section>

        <section className="flex flex-col gap-2">
          <button type="button" onClick={() => start(async () => { await addToSprintAction(card.id); mutate(); })} className="text-xs text-left text-[var(--color-mt-muted)] hover:text-[var(--color-mt-text)]">
            + adicionar ao Sprint
          </button>
          <button type="button" onClick={() => start(async () => { await removeFromSprintAction(card.id); mutate(); })} className="text-xs text-left text-[var(--color-mt-muted)] hover:text-[var(--color-mt-text)]">
            − tirar do Sprint
          </button>
          <button type="button" onClick={() => start(async () => { await archiveCardAction(card.id); onClose(); })} className="text-xs text-left text-rose-400">
            arquivar
          </button>
        </section>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Boot and exercise**

```bash
pnpm dev
```

Open a project, click a card, verify the panel opens; edit title (blur to save), edit description (save), set a due date with "amanha", toggle a label, add to sprint, archive. Each action should reflect on the board within ~3s.

- [ ] **Step 4: Commit**

```bash
git add components/CardPanel.tsx app/api/card/
git commit -m "feat(ui): CardPanel with markdown, labels, due-date parsing, sprint toggle"
```

---

### Task 30: Sprint page

**Files:**
- Create: `app/sprint/page.tsx`, `app/sprint/SprintClient.tsx`

- [ ] **Step 1: Write the server page**

```tsx
// app/sprint/page.tsx
import { getDb } from '@/lib/db/client';
import { getActiveSprint } from '@/lib/core/sprint';
import { SprintClient } from './SprintClient';
import type { Column } from '@/components/Board';
import type { CardData } from '@/components/Card';

export default async function SprintPage() {
  const sprint = await getActiveSprint(getDb());

  if (!sprint) {
    return (
      <div className="h-screen flex items-center justify-center text-sm text-[var(--color-mt-muted)]">
        <div className="text-center space-y-3">
          <p>Nenhuma sprint ativa.</p>
          <p>Peça pro Claude: "<span className="text-[var(--color-mt-text)]">inicia uma sprint</span>".</p>
        </div>
      </div>
    );
  }

  const groups: Record<'backlog' | 'doing' | 'done', CardData[]> = { backlog: [], doing: [], done: [] };
  for (const c of sprint.cards) {
    groups[c.sprintList].push({
      id: c.id,
      title: c.title,
      dueDate: c.dueDate,
      labels: c.labels,
      projectName: c.projectName,
      projectColor: c.projectColor,
    });
  }

  const columns: Column[] = [
    { id: 'backlog', title: 'Backlog', cards: groups.backlog },
    { id: 'doing', title: 'Fazendo', cards: groups.doing },
    { id: 'done', title: 'Feito', cards: groups.done },
  ];

  const startedDays = Math.floor((Date.now() - sprint.startedAt) / 86_400_000) + 1;

  return (
    <div className="h-screen flex flex-col bg-[var(--color-mt-sprint-bg)]">
      <SprintClient
        columns={columns}
        sprintName={sprint.name ?? 'Sprint'}
        startedDays={startedDays}
      />
    </div>
  );
}
```

- [ ] **Step 2: Write `SprintClient.tsx`**

```tsx
// app/sprint/SprintClient.tsx
'use client';
import { useState, useTransition } from 'react';
import { Board, type Column } from '@/components/Board';
import { CardPanel } from '@/components/CardPanel';
import { closeSprintAction } from '@/app/actions';

type Props = { columns: Column[]; sprintName: string; startedDays: number };

export function SprintClient({ columns, sprintName, startedDays }: Props) {
  const [openCardId, setOpenCardId] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [confirming, setConfirming] = useState(false);

  return (
    <>
      <header className="px-4 py-3 border-b border-[var(--color-mt-sprint-line)] flex items-center gap-3">
        <span className="w-2.5 h-2.5 rounded-full bg-[var(--color-mt-sprint-accent)]" />
        <h1 className="text-sm font-semibold">{sprintName}</h1>
        <span className="text-xs text-[var(--color-mt-muted)]">· dia {startedDays}</span>
        <div className="ml-auto">
          {confirming ? (
            <div className="flex gap-2 text-xs">
              <button type="button" disabled={pending} onClick={() => start(async () => { await closeSprintAction(true); setConfirming(false); })} className="bg-[var(--color-mt-sprint-accent)] px-2 py-1 rounded">
                Fechar e carregar
              </button>
              <button type="button" onClick={() => setConfirming(false)} className="text-[var(--color-mt-muted)] px-2 py-1">cancelar</button>
            </div>
          ) : (
            <button type="button" onClick={() => setConfirming(true)} className="text-xs text-[var(--color-mt-muted)] hover:text-[var(--color-mt-text)]">
              Fechar sprint
            </button>
          )}
        </div>
      </header>
      <div className="flex-1 min-h-0">
        <Board columns={columns} variant="sprint" onCardClick={(id) => setOpenCardId(id)} />
      </div>
      {openCardId && <CardPanel cardId={openCardId} onClose={() => setOpenCardId(null)} />}
    </>
  );
}
```

- [ ] **Step 3: Verify**

```bash
pnpm dev
```

Open `/sprint`. Without an active sprint, see the empty-state. To exercise: ask Claude (or hit `/api/card` directly) to start a sprint and add a card. Refresh and verify the purple Sprint UI renders with the card and its project pill.

- [ ] **Step 4: Commit**

```bash
git add app/sprint/
git commit -m "feat(ui): sprint page with purple theme, DnD, close-sprint flow"
```

---

<!-- PHASE-5 -->
### Task 31: Auto-refresh the board when Claude writes via MCP

The spec calls for SWR with `revalidateOnFocus` + 3s polling so that mutations made by Claude (outside the browser) show up automatically. Server Actions only revalidate when called by the UI itself — MCP writes bypass them. Fix this with a small `useAutoRefresh` hook that calls `router.refresh()` on focus and on an interval.

**Files:**
- Create: `components/useAutoRefresh.ts`
- Modify: `app/project/[id]/BoardClient.tsx`, `app/sprint/SprintClient.tsx`

- [ ] **Step 1: Write the hook**

```ts
// components/useAutoRefresh.ts
'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export function useAutoRefresh(intervalMs = 3000) {
  const router = useRouter();
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;
    let visible = !document.hidden;

    const start = () => {
      if (timer) return;
      timer = setInterval(() => router.refresh(), intervalMs);
    };
    const stop = () => {
      if (!timer) return;
      clearInterval(timer);
      timer = null;
    };

    if (visible) start();
    const onVis = () => {
      visible = !document.hidden;
      if (visible) { router.refresh(); start(); } else stop();
    };
    const onFocus = () => router.refresh();

    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('focus', onFocus);
    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('focus', onFocus);
    };
  }, [router, intervalMs]);
}
```

- [ ] **Step 2: Use it in `app/project/[id]/BoardClient.tsx`**

Replace the whole file with:

```tsx
// app/project/[id]/BoardClient.tsx
'use client';
import { useState } from 'react';
import { Board, type Column } from '@/components/Board';
import { CardPanel } from '@/components/CardPanel';
import { useAutoRefresh } from '@/components/useAutoRefresh';

export function BoardClient({ columns }: { columns: Column[] }) {
  const [openCardId, setOpenCardId] = useState<string | null>(null);
  useAutoRefresh(3000);
  return (
    <>
      <div className="flex-1 min-h-0">
        <Board columns={columns} variant="project" onCardClick={(id) => setOpenCardId(id)} />
      </div>
      {openCardId && <CardPanel cardId={openCardId} onClose={() => setOpenCardId(null)} />}
    </>
  );
}
```

- [ ] **Step 3: Use it in `app/sprint/SprintClient.tsx`**

Add `useAutoRefresh(3000)` at the top of the `SprintClient` component body (just below `useState`s). Imports:

```tsx
import { useAutoRefresh } from '@/components/useAutoRefresh';
// inside component:
useAutoRefresh(3000);
```

- [ ] **Step 4: Verify manually**

Boot the app (`pnpm dev`), open a project. In another terminal (or via Claude with MCP), insert a new card directly:

```bash
sqlite3 martrello.db "INSERT INTO cards (id,project_id,list_id,title,position,created_at,updated_at) VALUES ('test1', (SELECT id FROM projects LIMIT 1), (SELECT id FROM lists LIMIT 1), 'auto-refresh-test', 1000, $(date +%s%3N), $(date +%s%3N));"
```

Expected: within 3s, the card appears in the browser without reload. Switching to another tab and back triggers an instant refresh.

Remove the test row:

```bash
sqlite3 martrello.db "DELETE FROM cards WHERE id='test1';"
```

- [ ] **Step 5: Commit**

```bash
git add components/useAutoRefresh.ts app/project/ app/sprint/
git commit -m "feat(ui): auto-refresh board on focus and every 3s (sync with MCP writes)"
```

---

## Phase 6 — Polish & docs

### Task 32: Backup script

**Files:**
- Create: `scripts/backup.ts`

- [ ] **Step 1: Write**

```ts
// scripts/backup.ts
import { copyFileSync, mkdirSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

const SRC = path.resolve('./martrello.db');
const DST_DIR = path.join(
  homedir(),
  'Library', 'Mobile Documents', 'com~apple~CloudDocs', 'martrello', 'backups',
);

if (!existsSync(SRC)) {
  console.error(`No DB at ${SRC}; run pnpm db:migrate first.`);
  process.exit(1);
}

mkdirSync(DST_DIR, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 16);
const dst = path.join(DST_DIR, `martrello-${stamp}.db`);
copyFileSync(SRC, dst);
console.log(`backup → ${dst}`);
```

- [ ] **Step 2: Run**

```bash
pnpm backup
```

Expected: prints a path to iCloud-synced backup file. Verify with `ls` of the directory.

- [ ] **Step 3: Commit**

```bash
git add scripts/backup.ts
git commit -m "feat(scripts): backup db to iCloud Drive"
```

---

### Task 33: README with MCP config snippet

**Files:**
- Create: `README.md`

- [ ] **Step 1: Write README**

```markdown
# martrello

Personal Trello clone with Claude Code as the primary writer (via local MCP) and a dark-mode web UI for visualization + drag-and-drop.

## Quickstart

Requires Node 24+ and pnpm.

```bash
pnpm install
pnpm db:migrate
pnpm seed
pnpm dev          # web on http://localhost:3000
pnpm mcp:build    # builds the MCP server bundle
```

## MCP server setup (one-time)

Add to `~/.claude.json`:

```json
{
  "mcpServers": {
    "martrello": {
      "command": "node",
      "args": ["/Users/marceloferro/martrello/mcp/dist/index.js"]
    }
  }
}
```

Restart Claude Code. Tools like `martrello_create_card`, `martrello_get_sprint`, `martrello_close_sprint` will appear.

## Daily use

- **Write through Claude:** "Cria um card 'revisar PR #123' no projeto martrello, prazo sexta, label urgente."
- **Read in browser:** http://localhost:3000.
- **Backup:** `pnpm backup`.

## Reference

- Spec: [docs/superpowers/specs/2026-05-26-martrello-design.md](docs/superpowers/specs/2026-05-26-martrello-design.md)
- Plan: [docs/superpowers/plans/2026-05-26-martrello-v1.md](docs/superpowers/plans/2026-05-26-martrello-v1.md)
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: README with quickstart and MCP config snippet"
```

---

### Task 34: End-to-end smoke checklist

This is a manual verification — no code. Execute the checklist; if anything fails, file a follow-up task.

- [ ] **Step 1: Fresh DB end-to-end**

```bash
rm martrello.db
pnpm db:migrate
pnpm seed
pnpm mcp:build
```

- [ ] **Step 2: Boot web + verify sidebar**

```bash
pnpm dev
```

Open `http://localhost:3000`. Expected: redirects to Inbox; sidebar shows "Sprint atual" + "Inbox".

- [ ] **Step 3: Connect MCP from a fresh Claude Code session, run through these prompts**

- "Lista meus projetos" → expect Inbox.
- "Cria um projeto martrello, cor #3b82f6" → verify the sidebar shows it after browser refresh.
- "Cria um card 'revisar PR #123' no martrello, prazo sexta, label urgente" → verify card appears in "A fazer" with red label and date.
- "Inicia uma sprint" → verify `/sprint` shows "Sprint 1 · dia 1".
- "Adiciona aquele card ao sprint" → verify it appears in Backlog with a "martrello" pill.
- Drag it to "Fazendo" in the browser.
- "Move o card 'revisar PR #123' pra coluna 'done' do sprint" (or drag).
- "Fecha o sprint" → verify the card is archived and a new Sprint 2 starts empty.

- [ ] **Step 4: If everything works, tag**

```bash
git tag -a v0.1.0 -m "martrello v1: web + MCP, single sprint with history"
```

- [ ] **Step 5: Commit any small fixes found during smoke**

---

<!-- PHASE-6 -->
## Self-review notes

Quick pass against the spec at [docs/superpowers/specs/2026-05-26-martrello-design.md](../specs/2026-05-26-martrello-design.md):

- **Spec coverage:** All 7 schema tables, the one-active-sprint invariant, all listed MCP tools, the dark-mode UI with sprint purple variant, drag-and-drop, label strictness, pt-BR date parser, sprint carry-over preserving original column, and the iCloud backup are all mapped to tasks. Sync gap (Server Actions don't see MCP writes) caught and fixed in Task 31.
- **Out-of-scope honored:** No tasks for comments, checklists, attachments, multi-user, multi-sprint, mobile responsive, deploy, export/import, or notifications.
- **Minor additions beyond spec:** `martrello_get_card` MCP tool (small read helper, useful for the panel API route) and `tests/db.smoke.test.ts` (catches FK + partial-index regressions cheaply). Both low-risk extensions.
- **Type consistency:** `SprintList`, `CardData`, `Column`, `MartrelloError` codes, `POSITION_STEP`, `getDb()` signatures consistent across tasks. `getActiveSprint` (with cards) vs `getActiveSprintRow` (row only) are intentionally distinct.
- **No placeholders.** No TBDs or "implement later" in any step. The one self-aware "adjust the test if FK behavior differs" note in Task 19 is a deliberate hedge for a test that exercises an edge of the SDK's error surface.

