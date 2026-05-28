# Realtime Board Updates (SSE) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Push board/sprint updates to the browser in ~100-300ms whenever the SQLite DB changes — from the UI or the MCP server — replacing the 3s `useAutoRefresh` polling.

**Architecture:** A Node-runtime SSE route (`app/api/stream`) watches the DB directory with `fs.watch` (the WAL file's mtime changes on every write, regardless of process), debounces bursts, and emits a dumb `changed` event. A client hook (`useRealtimeRefresh`) consumes it via `EventSource` and calls `router.refresh()`, with a 20s polling fallback and focus revalidation. Zero changes to `lib/core`, `mcp`, or server actions.

**Tech Stack:** Next.js 16 App Router route handlers, Node `fs.watch`, `EventSource`, Vitest.

**Reference spec:** [docs/superpowers/specs/2026-05-28-realtime-sse-design.md](../specs/2026-05-28-realtime-sse-design.md)

**Branch:** `feat/realtime-sse` (already created from `main`).

---

## Milestone

End of plan: with the dev server running, opening the same board in two tabs and creating/moving a card via MCP in one makes the other update in < 1s with no manual reload; `/api/stream` stays open as an `eventsource` in DevTools.

---

## Task 1: Debounce helper (TDD)

**Files:**
- Create: `lib/realtime/debounce.ts`, `lib/realtime/debounce.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// lib/realtime/debounce.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { debounce } from './debounce';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('debounce', () => {
  it('coalesces multiple calls within the window into one', () => {
    const fn = vi.fn();
    const d = debounce(fn, 120);
    d(); d(); d();
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(120);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('uses the args from the last call', () => {
    const fn = vi.fn();
    const d = debounce(fn, 100);
    d('a'); d('b'); d('c');
    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledWith('c');
  });

  it('fires again for calls in a later window', () => {
    const fn = vi.fn();
    const d = debounce(fn, 100);
    d();
    vi.advanceTimersByTime(100);
    d();
    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('cancel() prevents a pending call', () => {
    const fn = vi.fn();
    const d = debounce(fn, 100);
    d();
    d.cancel();
    vi.advanceTimersByTime(100);
    expect(fn).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run, expect failure**

```bash
pnpm test lib/realtime/debounce.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// lib/realtime/debounce.ts
export function debounce<A extends unknown[]>(
  fn: (...args: A) => void,
  ms: number,
): ((...args: A) => void) & { cancel: () => void } {
  let timer: ReturnType<typeof setTimeout> | null = null;

  const debounced = (...args: A) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      fn(...args);
    }, ms);
  };

  debounced.cancel = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  };

  return debounced;
}
```

- [ ] **Step 4: Run, expect pass**

```bash
pnpm test lib/realtime/debounce.test.ts
```

Expected: all 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/realtime/debounce.ts lib/realtime/debounce.test.ts
git commit -m "feat(realtime): debounce helper for coalescing fs.watch bursts"
```

---

## Task 2: SSE stream endpoint

**Files:**
- Create: `app/api/stream/route.ts`

- [ ] **Step 1: Write the route**

```ts
// app/api/stream/route.ts
import { watch, type FSWatcher } from 'node:fs';
import path from 'node:path';
import { debounce } from '@/lib/realtime/debounce';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DB_PATH = process.env.DATABASE_URL?.replace(/^file:/, '') ?? './martrello.db';
const DB_DIR = path.dirname(path.resolve(DB_PATH));
const DB_BASENAME = path.basename(path.resolve(DB_PATH)); // "martrello.db"
const DEBOUNCE_MS = 120;
const KEEPALIVE_MS = 25_000;

export async function GET(request: Request) {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      let closed = false;
      let keepalive: ReturnType<typeof setInterval> | null = null;
      let watcher: FSWatcher | null = null;

      const safeEnqueue = (chunk: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          cleanup();
        }
      };

      // Coalesce WAL write bursts into a single "changed" event.
      const emitChanged = debounce(() => safeEnqueue('data: changed\n\n'), DEBOUNCE_MS);

      const cleanup = () => {
        if (closed) return;
        closed = true;
        emitChanged.cancel();
        if (keepalive) clearInterval(keepalive);
        if (watcher) watcher.close();
        try { controller.close(); } catch { /* already closed */ }
      };

      try {
        watcher = watch(DB_DIR, (_event, filename) => {
          // filename may be null on some platforms — treat as relevant.
          if (filename == null || filename.startsWith(DB_BASENAME)) emitChanged();
        });
      } catch (err) {
        safeEnqueue(`event: error\ndata: ${(err as Error).message}\n\n`);
        cleanup();
        return;
      }

      // Initial hello so the client knows the stream is live.
      safeEnqueue(': connected\n\n');

      keepalive = setInterval(() => safeEnqueue(': ping\n\n'), KEEPALIVE_MS);

      request.signal.addEventListener('abort', cleanup);
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}
```

- [ ] **Step 2: Verify TS compiles**

```bash
pnpm tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 3: Manual smoke — stream emits on DB change**

Start the dev server in the background, wait for ready, then open the stream with curl and write to the DB in another step:

```bash
pnpm dev > /tmp/sse-dev.log 2>&1 &
DEV_PID=$!
until curl -s -o /dev/null -w "%{http_code}" http://localhost:3000 2>/dev/null | grep -qE '^(200|307)'; do sleep 1; done

# Open the SSE stream for 6s in the background, capturing output
( curl -sN --max-time 6 http://localhost:3000/api/stream > /tmp/sse-out.txt & )
sleep 1
# Trigger a DB write
sqlite3 martrello.db "UPDATE cards SET updated_at = $(date +%s%3N) WHERE id = (SELECT id FROM cards LIMIT 1);"
sleep 2
echo "--- stream output ---"
cat /tmp/sse-out.txt
kill $DEV_PID 2>/dev/null; wait $DEV_PID 2>/dev/null
```

Expected: `/tmp/sse-out.txt` contains `: connected` and at least one `data: changed` line after the UPDATE.

- [ ] **Step 4: Commit**

```bash
git add app/api/stream/route.ts
git commit -m "feat(realtime): SSE endpoint watching the SQLite WAL directory"
```

---

## Task 3: `useRealtimeRefresh` client hook

**Files:**
- Create: `components/useRealtimeRefresh.ts`

- [ ] **Step 1: Write the hook**

```ts
// components/useRealtimeRefresh.ts
'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export function useRealtimeRefresh(opts: { fallbackMs?: number } = {}) {
  const router = useRouter();
  const fallbackMs = opts.fallbackMs ?? 20_000;

  useEffect(() => {
    let es: EventSource | null = null;

    try {
      es = new EventSource('/api/stream');
      es.onmessage = () => router.refresh();
      // On error, EventSource auto-reconnects; nothing to do but keep it.
    } catch {
      es = null; // EventSource unavailable — fallback poll still covers us.
    }

    const fallback = setInterval(() => router.refresh(), fallbackMs);
    const onFocus = () => router.refresh();
    window.addEventListener('focus', onFocus);

    return () => {
      es?.close();
      clearInterval(fallback);
      window.removeEventListener('focus', onFocus);
    };
  }, [router, fallbackMs]);
}
```

- [ ] **Step 2: Verify TS compiles**

```bash
pnpm tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 3: Commit**

```bash
git add components/useRealtimeRefresh.ts
git commit -m "feat(realtime): useRealtimeRefresh hook (EventSource + fallback poll + focus)"
```

---

## Task 4: Wire the hook into BoardClient and SprintClient

**Files:**
- Modify: `app/project/[id]/BoardClient.tsx`, `app/sprint/SprintClient.tsx`

- [ ] **Step 1: Inspect both files**

Read `app/project/[id]/BoardClient.tsx` and `app/sprint/SprintClient.tsx`. Both currently import and call `useAutoRefresh(3000)`. Confirm the exact import line and call site in each before editing.

- [ ] **Step 2: Replace in `BoardClient.tsx`**

Change the import:

```tsx
// remove:
import { useAutoRefresh } from '@/components/useAutoRefresh';
// add:
import { useRealtimeRefresh } from '@/components/useRealtimeRefresh';
```

Change the call inside the component body:

```tsx
// remove:
useAutoRefresh(3000);
// add:
useRealtimeRefresh();
```

- [ ] **Step 3: Replace in `SprintClient.tsx`**

Apply the exact same two changes (import line + call site) as Step 2.

- [ ] **Step 4: Remove the now-unused `useAutoRefresh` (if no other references)**

```bash
grep -rn "useAutoRefresh" app components
```

Expected: zero matches after the edits above. If zero, delete the file:

```bash
git rm components/useAutoRefresh.ts
```

If there are remaining references (unexpected), leave the file and note it.

- [ ] **Step 5: Verify TS compiles + tests still pass**

```bash
pnpm tsc --noEmit
pnpm test
```

Expected: zero TS errors; all tests pass (81 + 4 new debounce = 85). If the flaky sprint timestamp test trips, re-run once.

- [ ] **Step 6: Commit**

```bash
git add app/project/[id]/BoardClient.tsx app/sprint/SprintClient.tsx
git rm components/useAutoRefresh.ts 2>/dev/null || true
git commit -m "feat(realtime): drive board/sprint refresh from SSE, drop 3s polling"
```

---

## Task 5: Build verification + two-tab smoke + PR

**Files:** none changed.

- [ ] **Step 1: Build**

```bash
pnpm build
```

Expected: compiles clean; `/api/stream` appears in the route list as a dynamic (`ƒ`) function.

- [ ] **Step 2: Full test suite**

```bash
pnpm test
```

Expected: all green (85 tests).

- [ ] **Step 3: Two-tab realtime smoke (manual)**

```bash
pnpm dev
```

1. Open `http://localhost:3000/project/<a-project-with-cards>` in two browser tabs.
2. In a terminal, write directly to the DB to simulate an MCP write:
   ```bash
   PID=$(sqlite3 martrello.db "SELECT id FROM projects WHERE name='Nubank' LIMIT 1;")
   LID=$(sqlite3 martrello.db "SELECT id FROM lists WHERE project_id='$PID' ORDER BY position LIMIT 1;")
   sqlite3 martrello.db "INSERT INTO cards (id,project_id,list_id,title,position,created_at,updated_at) VALUES ('rt-smoke','$PID','$LID','realtime smoke', 99000, $(date +%s%3N), $(date +%s%3N));"
   ```
3. Both tabs should show the "realtime smoke" card appear in < 1s **without reloading**.
4. Open DevTools → Network in one tab; confirm `/api/stream` is an open `eventsource` receiving periodic data.
5. Cleanup: `sqlite3 martrello.db "DELETE FROM cards WHERE id='rt-smoke';"` — the card disappears from both tabs within ~1s.
6. Repeat the check on `/sprint`.

Stop the dev server.

- [ ] **Step 4: Push and open PR**

```bash
git push -u origin feat/realtime-sse
gh pr create --base main --head feat/realtime-sse \
  --title "feat: realtime board updates via SSE" \
  --body "$(cat <<'EOF'
## Summary

- Board and sprint now update in ~100-300ms whenever the DB changes — from the UI or the MCP server — replacing the 3s polling. Per [docs/superpowers/specs/2026-05-28-realtime-sse-design.md](docs/superpowers/specs/2026-05-28-realtime-sse-design.md).
- \`app/api/stream\` (Node runtime) watches the SQLite WAL directory via \`fs.watch\`, debounces bursts, emits a \`changed\` SSE event. Zero instrumentation in core/MCP/actions.
- \`useRealtimeRefresh\` consumes it via \`EventSource\` → \`router.refresh()\`, with a 20s polling fallback and focus revalidation. Replaces \`useAutoRefresh\`.

## Known limitation

Local-only: long-lived SSE + \`fs.watch\` don't work on serverless. Documented in the spec; the hook degrades to the 20s fallback if the stream never connects.

## Test plan

- [ ] \`pnpm test\` — 85 passing (4 new debounce tests)
- [ ] \`pnpm build\` — clean
- [ ] Two tabs on the same board; write a card via MCP/sqlite; both update < 1s with no reload; \`/api/stream\` open as eventsource in DevTools

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Self-review notes

- **Spec coverage:** debounce helper + test (Task 1), SSE endpoint with dir-watch / filename-null handling / keepalive / abort cleanup (Task 2), `useRealtimeRefresh` with EventSource + fallback + focus (Task 3), wiring + dropping `useAutoRefresh` (Task 4), build + two-tab smoke + serverless-limitation note in PR (Task 5). All spec sections mapped.
- **No placeholders:** every step has real code or a concrete command with expected output.
- **Type consistency:** `debounce(fn, ms)` returns a callable with `.cancel()` (Task 1); the SSE route (Task 2) imports it as `emitChanged = debounce(...)` and calls `emitChanged()` / `emitChanged.cancel()` — signatures match. `useRealtimeRefresh()` (Task 3) is called with no args in Task 4, matching its optional-opts signature. No dead code: the tested `debounce` helper is the one the route uses.
