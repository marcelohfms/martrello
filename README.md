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
