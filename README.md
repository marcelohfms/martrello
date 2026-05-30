# martrello

A personal Trello clone with an unusual split of labor: **Claude Code is the writer, you are the reader.** You add, edit, move, label, and schedule tasks by talking to Claude in natural language; Claude calls a local MCP server that writes to the database. A dark-mode web UI gives you the board to look at and drag cards around. Everything runs locally on your machine — SQLite on disk, no cloud, no account.

> "Cria um card 'revisar PR #123' no projeto martrello, prazo sexta, label urgente" → Claude calls `martrello_create_card(...)` → the card shows up on your board in under a second.

---

## Why it's built this way

Most task tools make *you* do the data entry through forms. martrello flips that: the heavy lifting (creating cards, organizing sprints, setting deadlines) happens through conversation with Claude, which is faster and lower-friction than clicking around. The web UI focuses on the two things a screen is genuinely better at than chat: **seeing the whole board at a glance** and **dragging cards between columns.**

---

## Features

- **Projects** — each is its own kanban board with custom columns (default: A fazer / Fazendo / Feito).
- **Cards** — title, markdown description, due date, labels. Drag-and-drop within and across columns.
- **Global labels** — shared across all projects (useful because the Sprint crosses projects).
- **Sprint** — a single active sprint that aggregates selected cards from any project into its own backlog / doing / done board. Each card shows a pill with its origin project.
  - **Carry-over on close**: closing a sprint archives the "done" cards and carries the incomplete ones into a new sprint, **preserving their original column**. Closed sprints are snapshotted for history.
- **Visual deadline picker** — calendar (react-day-picker) with shortcut buttons: Hoje, Amanhã, Próxima semana, Próximo mês (with end-of-month clamping).
- **Realtime updates** — the board reflects DB changes in ~100-300ms via Server-Sent Events, whether the write came from the UI or from Claude via MCP. No manual refresh.
- **Natural-language dates** — when writing through Claude, due dates accept ISO (`2026-06-15`) or pt-BR shorthands (`hoje`, `amanhã`, `sex`, `+3d`, `próxima sexta`, `daqui 2 semanas`).
- **Dark mode** — Trello-style layout, petrol-blue palette for projects, purple for the sprint.

---

## Architecture

Two processes share one SQLite file:

```
  ┌─────────────────────┐         writes          ┌──────────────────┐
  │  Claude Code (you    │ ───── via MCP tools ───▶ │                  │
  │  talking in chat)    │                          │   martrello.db   │
  └─────────────────────┘                          │   (SQLite, WAL)  │
                                                    │                  │
  ┌─────────────────────┐    reads + drag-drop      │                  │
  │  Web UI (Next.js)    │ ◀──── writes via ───────▶ │                  │
  │  localhost:3000      │      Server Actions       └────────┬─────────┘
  └──────────▲──────────┘                                     │
             │                                       WAL file mtime changes
             │   "data: changed" (SSE)               on every write
             │                                                │
             └────────── /api/stream ◀──── fs.watch ──────────┘
```

- **`lib/core/`** — all domain logic (projects, lists, cards, labels, sprint, positions, dates). Pure functions over a Drizzle DB handle, shared by both the web app and the MCP server. This is the single source of business rules.
- **`mcp/`** — the MCP server. Wraps `lib/core` as ~30 typed tools over stdio. Built to `mcp/dist/index.js` with esbuild.
- **`app/`** — Next.js App Router. Server Components read via `lib/core`; Server Actions (`app/actions.ts`) mutate; `app/api/stream` is the SSE endpoint.
- **`components/`** — React UI (Sidebar, Board with @dnd-kit, Card, CardPanel, DeadlinePicker, …).

---

## Tech stack

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS v4 · Drizzle ORM · better-sqlite3 · @modelcontextprotocol/sdk · @dnd-kit · react-day-picker · SWR · Zod · ulidx · Vitest.

---

## Prerequisites

- **Node.js 24+** (LTS)
- **pnpm** (`npm i -g pnpm`)
- **Claude Code** (to use the MCP write path)

---

## Getting started

```bash
pnpm install
pnpm db:migrate    # create the SQLite schema in ./martrello.db
pnpm seed          # create the Inbox project + default labels (idempotent)
pnpm mcp:build     # bundle the MCP server to mcp/dist/index.js
pnpm dev           # web UI at http://localhost:3000
```

## MCP server setup (one-time)

Add the snippet below to your `~/.claude.json` under the `mcpServers` key. Replace `<ABSOLUTE_PATH_TO_REPO>` with where you cloned this repo (get it with `pwd` from the repo root):

```json
{
  "mcpServers": {
    "martrello": {
      "command": "node",
      "args": ["<ABSOLUTE_PATH_TO_REPO>/mcp/dist/index.js"]
    }
  }
}
```

Restart Claude Code. The `martrello_*` tools become available in every session.

---

## Usage

**Write through Claude** — just describe what you want:

- *"Cria um projeto 'Nubank' e adiciona o card 'revisar PR #123' com prazo sexta e label urgente"*
- *"Inicia uma sprint e joga aquele card no backlog"*
- *"Move o card 'revisar PR #123' pra coluna done do sprint"*
- *"Fecha o sprint"* (done cards archived, incomplete ones carried forward)
- *"Me mostra o que tem no sprint atual"*

**Read in the browser** — open http://localhost:3000. Sidebar lists projects + the active sprint. Click a card to open the side panel (description, labels, deadline picker). Drag cards between columns. The board updates live as Claude writes.

**Back up** — `pnpm backup` copies `martrello.db` (timestamped) to your iCloud Drive folder.

---

## MCP tools reference

~30 tools, grouped:

**Read** — `martrello_list_projects`, `martrello_get_project`, `martrello_get_sprint`, `martrello_search_cards`, `martrello_list_labels`, `martrello_list_sprints`, `martrello_get_sprint_history`

**Projects** — `martrello_create_project`, `martrello_update_project`, `martrello_archive_project`, `martrello_reorder_projects`

**Lists** — `martrello_create_list`, `martrello_rename_list`, `martrello_delete_list`, `martrello_reorder_lists`

**Cards** — `martrello_create_card`, `martrello_get_card`, `martrello_update_card`, `martrello_move_card`, `martrello_archive_card`, `martrello_unarchive_card`

**Labels** — `martrello_create_label`, `martrello_add_label`, `martrello_remove_label`, `martrello_delete_label`

**Sprint** — `martrello_start_sprint`, `martrello_add_to_sprint`, `martrello_move_in_sprint`, `martrello_remove_from_sprint`, `martrello_close_sprint`

---

## Project structure

```
app/
  layout.tsx              root shell + sidebar
  page.tsx                redirects to first project or /sprint
  project/[id]/           project board page + client wrapper
  sprint/                 sprint page + client wrapper
  api/card/[id]/          single-card JSON for the side panel
  api/stream/             SSE endpoint (realtime)
  actions.ts              Server Actions (UI mutations)
components/                Sidebar, Board, List, Card, CardPanel, DeadlinePicker, …
lib/
  db/                     Drizzle schema, client, migrations
  core/                   domain logic (shared by web + MCP)
  realtime/               debounce helper for SSE
  errors.ts               structured errors + suggestions
mcp/                       MCP server (tools/ + stdio entry)
scripts/                   migrate, seed, backup, build-mcp
docs/superpowers/          design specs + implementation plans
```

---

## Development

```bash
pnpm test            # run the Vitest suite
pnpm test:watch      # watch mode
pnpm tsc --noEmit    # type-check
pnpm build           # production build
pnpm db:generate     # generate a migration after editing lib/db/schema.ts
pnpm db:migrate      # apply migrations
```

The domain logic in `lib/core` is covered by unit tests (in-memory SQLite). The MCP tools have integration tests. UI is verified manually.

---

## Known limitations

- **Local-only.** The realtime SSE endpoint relies on a long-lived connection + `fs.watch`, which don't work on serverless platforms (e.g., Vercel functions are ephemeral with a read-only filesystem). Running on a cloud platform would require a different change-detection mechanism (Postgres `LISTEN/NOTIFY`, a Redis pub/sub, or client polling) and a networked database instead of a local SQLite file. The UI degrades gracefully — if the SSE stream never connects, a 20s polling fallback keeps it current.
- **Single user, no auth.** Designed for one person on `localhost`.

---

## Docs

Design specs and implementation plans live in `docs/superpowers/`:

- [v1 design](docs/superpowers/specs/2026-05-26-martrello-design.md) · [v1 plan](docs/superpowers/plans/2026-05-26-martrello-v1.md)
- [Deadline picker](docs/superpowers/specs/2026-05-27-deadline-date-picker-design.md)
- [Realtime SSE](docs/superpowers/specs/2026-05-28-realtime-sse-design.md)
