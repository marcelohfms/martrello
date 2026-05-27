# martrello — design spec

**Data:** 2026-05-26
**Status:** aprovado para implementação
**Autor:** Marcelo + Claude (brainstorming)

---

## 1. Objetivo

Construir um clone do Trello **para uso pessoal local**, focado em organizar tarefas de múltiplos projetos pessoais com um **Sprint único e ativo** que agrega cards selecionados de qualquer projeto.

**Característica diferencial:** o usuário é o **leitor e organizador** (visualiza no navegador, arrasta cards entre colunas). O **Claude Code é o escritor principal** — toda criação, edição, label, prazo e movimentação por linguagem natural acontece via um **servidor MCP local** que expõe a API do martrello como ferramentas tipadas para o Claude.

### Premissas

- Usuário único (sem auth, sem multi-tenant).
- Roda em `localhost` no Mac do usuário. Sem deploy em nuvem no v1.
- Persistência em arquivo SQLite local (`martrello.db`), backupável com `cp`.
- O Claude Code está sempre disponível como interface de escrita; a UI web prioriza visualização e drag-and-drop.

---

## 2. Stack

- **Next.js 16 App Router** (TypeScript) — UI + Server Actions.
- **React 19** + **Tailwind CSS** — componentes + estilização.
- **`better-sqlite3`** + **Drizzle ORM** — persistência síncrona local; migrations via `drizzle-kit`.
- **`@dnd-kit`** — drag-and-drop acessível.
- **Zod** — validação de inputs (Server Actions e tools MCP).
- **SWR** — fetch + cache client-side com `revalidateOnFocus` e polling leve.
- **`@modelcontextprotocol/sdk`** — implementação do servidor MCP.
- **Vitest** — testes unitários e de integração.
- **ULID** (`ulidx`) — IDs.

### Justificativas

- **Por que Next.js e não Vite-SPA:** Server Actions eliminam a necessidade de definir endpoints REST à mão; Server Components reduzem JS no cliente; se eventualmente quiser mover pra nuvem, é só trocar o adapter de banco (SQLite → Postgres no Drizzle).
- **Por que SQLite em arquivo (e não IndexedDB):** backup = `cp martrello.db`. Sem risco de perder dados ao limpar o navegador.
- **Por que MCP server (e não CLI/REST):** ferramentas MCP aparecem para o Claude com schemas tipados; conversa fica fluida sem que o Claude precise lembrar sintaxe de CLI ou montar JSON manualmente.

### Estilo visual

Trello clássico em **dark mode**:

- Fundo do board: azul-petróleo escuro (`#0d1b2a`).
- Listas: tom acima (`#1b2a3a`).
- Cards: `#22344a`, com **borda lateral colorida** indicando label primária.
- Sprint: paleta roxa/violeta (`#150d22` / `#221833` / `#2c2042`) para diferenciar visualmente dos projetos.
- Cada card no Sprint exibe uma **pílula** com o nome do projeto de origem.

---

## 3. Modelo de dados

Schema SQLite definido em `lib/db/schema.ts` (Drizzle).

```ts
projects {
  id           text PK              // ULID
  name         text UNIQUE not null
  color        text not null        // hex, usado em badge da sidebar
  position     integer not null     // ordem na sidebar
  created_at   integer not null     // unix ms
  archived_at  integer              // soft delete
}

lists {                             // colunas dentro de um projeto
  id          text PK
  project_id  text → projects.id ON DELETE CASCADE
  name        text not null
  position    integer not null
  created_at  integer not null
}

cards {
  id          text PK
  project_id  text → projects.id ON DELETE CASCADE
  list_id     text → lists.id      ON DELETE CASCADE
  title       text not null
  description text                  // markdown
  due_date    text                  // ISO YYYY-MM-DD
  position    integer not null
  created_at  integer not null
  updated_at  integer not null
  archived_at integer               // soft delete
}

labels {                            // globais, compartilhadas entre projetos
  id    text PK
  name  text UNIQUE not null
  color text not null               // hex
}

card_labels {                       // M:N
  card_id  → cards.id  ON DELETE CASCADE
  label_id → labels.id ON DELETE CASCADE
  PRIMARY KEY (card_id, label_id)
}

sprints {
  id             text PK            // ULID
  name           text               // "Sprint 12", auto-gerado se omitido
  started_at     integer not null
  closed_at      integer            // NULL = sprint ativa (invariante: ≤1 com NULL)
  cards_snapshot text               // JSON imutável, populado no close
}

sprint_slots {                      // cards na sprint ativa
  card_id     text PK → cards.id ON DELETE CASCADE
  sprint_id   text → sprints.id  ON DELETE CASCADE
  sprint_list text not null         // "backlog" | "doing" | "done"
  position    integer not null
  added_at    integer not null
}
```

### Invariantes

- **No máximo uma sprint ativa** (`closed_at IS NULL`). Enforced via índice único parcial: `CREATE UNIQUE INDEX one_active_sprint ON sprints (closed_at) WHERE closed_at IS NULL`.
- **`sprint_slots` aponta apenas para a sprint ativa.** Sprints fechadas têm seu estado em `cards_snapshot`.
- **`cards.list_id` pertence a `cards.project_id`** — validado pela camada de domínio (não pelo schema; ON DELETE CASCADE garante consistência de remoção).
- **Cards arquivados são removidos do sprint** automaticamente.

### Posições

`position` é um inteiro renumerado a cada movimentação (passo de 1000 para deixar espaço futuro, mas renumerado quando ficar pulado). Implementação em `lib/core/positions.ts`. Single-user local, não precisa de LexoRank.

---

## 4. Lógica de domínio

Toda a lógica de negócio vive em `lib/core/*` e é compartilhada entre Server Actions (UI) e tools MCP. Nada de duplicar regras.

### Cards

- **Criar:** valida que `list_id` pertence a `project_id`. Define `position = max(position) + 1000` na list.
- **Mover (`move_card`):** se mudou de list, valida que a nova list pertence ao projeto destino. Renumera posições da list de origem e destino. Se mudou de projeto, remove labels que sejam project-scoped (não aplica em v1 porque labels são globais, mas a validação fica documentada).
- **Arquivar:** seta `archived_at = now()`; remove `sprint_slot` se houver.
- **Desarquivar:** zera `archived_at`. Não restaura no sprint (precisa de `add_to_sprint` explícito).

### Sprint

- **`start_sprint`:** erro se já existe ativa. `name` default: `"Sprint <N>"` onde N = total de sprints + 1.
- **`add_to_sprint`:** idempotente. Se card já está no sprint, atualiza coluna/posição em vez de duplicar.
- **`close_sprint({name_for_next?, carry_incomplete?=true})`:**
  1. Em uma transação SQLite:
     - Serializa todos os `sprint_slots` da ativa em JSON (incluindo `card_id`, `sprint_list`, `position` e snapshot resumido do card: title, project_name, labels). Salva em `sprints.cards_snapshot`.
     - Seta `closed_at = now()` na sprint ativa.
     - Para cada card no slot:
       - Se `sprint_list = "done"` → arquiva o card e deleta o slot.
       - Caso contrário, se `carry_incomplete = true` → cria nova sprint ativa (uma única vez, com `name_for_next` ou auto-gerado), realoca o slot para ela, **mantendo a coluna original** (`sprint_list` preservado) e renumerando posições.
       - Se `carry_incomplete = false` → deleta o slot (card sai do sprint e continua no projeto de origem); nenhuma sprint nova é aberta.
  2. Retorna `{closed: {id, name, done_count, carried_count}, opened?: {id, name}}`. `opened` é omitido se nenhuma nova sprint foi criada.
- **`get_sprint_history`:** lê `cards_snapshot` da sprint pelo id e devolve estruturado.

### Parser de datas (pt-BR)

`lib/core/dates.ts` aceita:

- ISO: `2026-06-15`
- Relativo: `hoje`, `amanhã`, `ontem`
- Dias da semana: `sex`, `sexta`, `segunda`
- Offsets: `+3d`, `+1s`, `+2sem`
- Compostos: `próxima sexta`, `daqui 2 semanas`

Resolve contra `now()` no momento da chamada. Retorna `YYYY-MM-DD` ou lança `INVALID_DATE`.

### Erros estruturados

Todas as tools MCP retornam erros no formato:

```ts
{ error: "PROJECT_NOT_FOUND", message: "Projeto 'foo' não existe", suggestions?: string[] }
```

Códigos: `PROJECT_NOT_FOUND`, `LIST_NOT_FOUND`, `CARD_NOT_FOUND`, `LABEL_NOT_FOUND`, `INVALID_DATE`, `SPRINT_ALREADY_ACTIVE`, `NO_ACTIVE_SPRINT`, `LIST_NOT_IN_PROJECT`, `LIST_NOT_EMPTY`. `suggestions` é populado em `_NOT_FOUND` com nomes próximos (Levenshtein simples).

---

## 5. Superfície MCP

Servidor MCP em `mcp/index.ts`. Tools agrupadas por categoria. **Nomes** aceitos onde forem únicos (projects.name, labels.name); **IDs** onde não (cards, sprints).

### Leitura

```
martrello_list_projects(include_archived?=false)
martrello_get_project(project: name|id)
martrello_get_sprint()                 // sprint ativa
martrello_search_cards(query, project?, label?, include_archived?=false)
martrello_list_labels()
martrello_list_sprints(limit?=20)
martrello_get_sprint_history(sprint_id)
```

### Projetos

```
martrello_create_project(name, color?, lists?=["A fazer","Fazendo","Feito"])
martrello_update_project(name|id, {name?, color?})
martrello_archive_project(name|id)
martrello_reorder_projects(ordered_ids[])
```

### Listas

```
martrello_create_list(project, name, position?=end)
martrello_rename_list(project, list_name|id, new_name)
martrello_delete_list(project, list_name|id, force?=false)
martrello_reorder_lists(project, ordered_names_or_ids[])
```

### Cards

```
martrello_create_card({
  project, list?, title, description?, due_date?, labels?, add_to_sprint?
})
martrello_update_card(id, {title?, description?, due_date?})
martrello_move_card(id, {to_project?, to_list, position?=end})
martrello_archive_card(id)
martrello_unarchive_card(id)
```

### Labels

```
martrello_create_label(name, color)
martrello_add_label(card_id, label_name|id)
martrello_remove_label(card_id, label_name|id)
martrello_delete_label(name|id)
```

### Sprint

```
martrello_start_sprint(name?)
martrello_close_sprint({name_for_next?, carry_incomplete?=true})
martrello_add_to_sprint(card_id, sprint_list?="backlog")
martrello_remove_from_sprint(card_id)
martrello_move_in_sprint(card_id, sprint_list, position?=end)
```

### Princípios

- **Idempotência onde dá:** `add_to_sprint` em card já presente atualiza posição; não duplica.
- **Validação no servidor MCP** (não confiar no caller). UI faz sua própria validação via mesma `lib/core`.
- **Labels são estritas:** `create_card({labels})`, `add_label` e `move_card` **não criam labels implicitamente**. Se a label não existe, retorna `LABEL_NOT_FOUND`. Criação só via `martrello_create_label` explícito.
- **Sem batch v1.** Chamadas múltiplas funcionam; `batch_*` adicionado se virar dor.

---

## 6. UI

### Telas

| Tela | Inclui | Não inclui |
|---|---|---|
| **Sidebar** | Lista de projetos com badge de cor + contagem de cards; link "Sprint atual" no topo | Configurações, gerenciamento de labels (via MCP) |
| **Board (projeto)** | Colunas, cards, drag-and-drop dentro e entre colunas, "+ novo card" simples por coluna (só título) | Reordenar colunas, arrastar entre projetos (ambos via MCP) |
| **Sprint** | Mesmo componente Board reutilizado, com colunas fixas `backlog`/`doing`/`done`, pílula de projeto-origem em cada card, header com `nome + dia N`, botão "Fechar sprint" | UI para `start_sprint` (auto-iniciada no primeiro `add_to_sprint`), histórico de sprints (via MCP) |
| **Painel lateral do card** | Título editável inline, descrição markdown (view + edit), labels (toggle), due date | Comentários, checklists, attachments, histórico |

### Drag-and-drop (v1)

- ✅ Cards entre colunas e dentro de colunas (board e sprint).
- ❌ Cards entre projetos (via MCP).
- ❌ Tirar card do sprint via drag (via MCP).
- ❌ Reordenar colunas (via MCP).

### Markdown

`react-markdown` para renderização. Sem editor WYSIWYG — textarea simples com preview ao salvar.

---

## 7. Sincronização browser ↔ MCP

**v1:** SWR no client com `revalidateOnFocus: true` + `refreshInterval: 3000ms` para queries do board ativo. Suspende polling em abas não focadas.

Fluxo típico:

1. Usuário diz ao Claude: "adiciona card X no projeto Y".
2. Claude chama `martrello_create_card(...)` via MCP.
3. Servidor MCP escreve no SQLite.
4. Usuário troca para a aba do navegador → `onFocus` dispara revalidação SWR → card aparece.

**Pior caso** (usuário já está na aba): até 3s de delay até o próximo poll.

**Upgrade v2 (esboçado, inativo no v1):** `mcp/notify.ts` escreve um arquivo-trigger após cada mutação. `app/api/events/route.ts` (SSE) watcha o arquivo via `chokidar` e empurra invalidação para clients conectados. Latência percebida cai pra ~50ms.

---

## 8. Estrutura de pastas

```
martrello/
├── app/                       # Next.js App Router
│   ├── layout.tsx
│   ├── page.tsx               # redireciona pra primeiro projeto ou /sprint
│   ├── project/[id]/page.tsx
│   ├── sprint/page.tsx
│   └── (server-actions colocalizados nos componentes)
├── components/
│   ├── Sidebar.tsx
│   ├── Board.tsx              # reutilizado por project e sprint
│   ├── List.tsx
│   ├── Card.tsx
│   ├── CardPanel.tsx          # painel lateral
│   └── ui/                    # primitives (Button, Input, etc.)
├── lib/
│   ├── db/
│   │   ├── schema.ts
│   │   ├── client.ts          # better-sqlite3 + drizzle singleton
│   │   └── migrations/        # output de drizzle-kit
│   ├── core/                  # lógica de domínio compartilhada UI + MCP
│   │   ├── projects.ts
│   │   ├── lists.ts
│   │   ├── cards.ts
│   │   ├── labels.ts
│   │   ├── sprint.ts
│   │   ├── positions.ts
│   │   └── dates.ts
│   ├── validators.ts          # zod schemas
│   └── errors.ts              # códigos de erro estruturados
├── mcp/
│   ├── index.ts               # entry do MCP server (stdio transport)
│   ├── tools/                 # uma tool por arquivo
│   └── notify.ts              # arquivo-trigger pra futuro SSE
├── scripts/
│   ├── seed.ts                # cria Inbox + labels default
│   └── backup.ts              # cp martrello.db → iCloud
├── tests/                     # Vitest specs
├── public/
├── martrello.db               # gitignored
├── drizzle.config.ts
├── next.config.ts
├── package.json
├── tsconfig.json
└── .env.local                 # DATABASE_URL=file:./martrello.db
```

Single repo, single `package.json`. Sem monorepo.

---

## 9. Testes

- **Vitest unit** para `lib/core/*`:
  - `positions.ts` — renumeração, edge cases.
  - `dates.ts` — todos os formatos pt-BR.
  - `sprint.ts` — close transactional, carry com coluna preservada, archive de done.
  - `cards.ts` — move entre listas/projetos, archive limpa sprint slot.
- **Vitest integration** para tools MCP — banco SQLite in-memory (`:memory:`), chama a tool, verifica DB state. Cobre: `create_card`, `move_card`, `archive_card`, `add_to_sprint`, `close_sprint` (com mix de done/incompletos), `archive_project` (cascade).
- **Playwright smoke (opcional v1)** — abre `localhost:3000`, cria card via UI, arrasta entre colunas, verifica persistência.
- **Sem testes de componente React** — leveza first, validação manual da UI.

Alvo de cobertura: 80%+ em `lib/core`, 70%+ em `mcp/tools`.

---

## 10. Setup e operação

### Pré-requisitos

- **Node.js 24+** (LTS atual).
- **pnpm** como gerenciador de pacotes.

### Dev

```bash
pnpm install
pnpm db:push       # cria schema no martrello.db
pnpm seed          # cria projeto "Inbox" + labels default
pnpm dev           # Next.js em localhost:3000
```

O MCP server é iniciado **on-demand pelo Claude Code** quando o usuário abre uma sessão. Configuração em `~/.claude.json`:

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

(O snippet exato é gerado no fim da implementação.)

### Migrations

```bash
pnpm db:generate   # gera SQL após alterar schema.ts
pnpm db:migrate    # aplica
```

### Backup

```bash
pnpm backup        # cp martrello.db → ~/Library/Mobile Documents/com~apple~CloudDocs/martrello/backups/martrello-YYYY-MM-DD-HHMM.db
```

Pode ser automatizado via launchd no futuro.

### Seed

Idempotente. Cria:

- Projeto `Inbox` (cor cinza, listas "A fazer / Fazendo / Feito").
- Labels: `urgente` (vermelho), `bug` (laranja), `melhoria` (azul), `ideia` (roxo), `pessoal` (verde).

---

## 11. Fora de escopo (v1)

Explicitamente **não** vamos fazer no v1:

- Multi-usuário / auth.
- Múltiplas sprints ativas simultâneas.
- Comentários em cards.
- Checklists / sub-tarefas.
- Anexos / upload de arquivos.
- Mobile responsive (desktop-first; não deve quebrar em tablet, mas não é prioridade).
- Deploy em nuvem.
- Export/import (Trello JSON, CSV, Notion).
- Notificações (browser, email, push).
- Tarefas recorrentes.
- UI de busca (busca existe via MCP).
- Templates de card.
- Cores customizadas por usuário / temas alternativos.

---

## 12. Roadmap v2 (referência, não compromisso)

- SSE para sync instantâneo (`mcp/notify.ts` ativo).
- UI de histórico de sprints com gráficos simples.
- Múltiplas sprints simultâneas (e.g., "Trabalho" + "Pessoal" rodando em paralelo).
- Export/import JSON.
- Mobile-friendly view (PWA + responsive).
- Comentários como log de progresso.
- Deploy opcional na Vercel com Postgres.
