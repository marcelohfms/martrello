---
version: 1
slug: "app-app-layout-tsx"
primary_target: "app/(app)/layout.tsx"
related_targets: ["app/login/page.tsx"]
---

Scope: authenticated shell (sidebar, project board, sprint board, card panel) and login. Mode: Operate. Task: read the state of work at a glance, move cards, adjust details.

## Direction contract

THESIS: A consultancy's working board: the sober Axivero identity carries a kanban that a Trello user reads instantly. It refuses both the dark-navy dev-tool look it replaces and the grey SaaS board with one accent.

OWN-WORLD: Forest green #002B0F shell, paper #F8F8F6 ground, greige #EAE7E4 columns, white cards with #E3DEDA hairline and diffuse shadow. Plus Jakarta Sans throughout, caps labels with +12% tracking, Lucide icons, `//` in supporting titles, the X monogram unaltered. Light ground because the scene is a laptop in office daylight.

STORY: The visitor sees where they are, reads columns left to right, spots overdue and blocked cards without opening them, and on Sprint knows each card's project from its acronym tag.

FIRST VIEWPORT: Left, 240px green rail with mark, wordmark, reveal toggle, Sprint link, project list by acronym with counts, logout. Right, a 56px header over full-height greige columns; primary action is "Novo card" at each column's foot. On Sprint the header itself turns forest green.

FORM: Pinned by the user's request (Axivero Design System); no concept roll. seed: none (unavailable). Signature move: on Sprint the green rail wraps across the header as an L-shaped band carrying `Sprint // name`, the day and a stacked done/doing/backlog bar, so the mode change is legible from across the room.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
