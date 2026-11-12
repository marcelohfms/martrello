# Martrello multiusuário — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transformar o martrello num sistema do time da Axivero: acesso por convite, login por e-mail, projetos com membros, responsável por tarefa, listas fixas, sprint pessoal semanal automática, histórico de mudanças e MCP com identidade.

**Architecture:** Toda regra de negócio continua em `lib/core/*` e passa a receber um `Actor` (usuário ou sistema). As checagens de visibilidade, permissão e o registro de histórico vivem no core, então a tela (server actions), as rotas e o MCP herdam as mesmas regras. A sprint deixa de ter tabela de slots: ela é derivada das tarefas do responsável nas etapas A fazer, Fazendo e Feito, e a tabela `sprints` guarda só a semana e o snapshot do fechamento. Três migrações Drizzle (0005 a 0007), com a parte de dados escrita à mão, convertem o banco de produção.

**Tech Stack:** Next.js 16 App Router, React 19, SQLite (better-sqlite3) + Drizzle, argon2 (`@node-rs/argon2`), vitest, MCP SDK, Resend via `fetch` (sem SDK novo).

**Spec:** `docs/superpowers/specs/2026-11-12-multiusuario-responsaveis-design.md`

## Global Constraints

- Interface e mensagens de erro em português do Brasil, tom sóbrio, sem exclamações e sem emoji (`PRODUCT.md`).
- Visual pelo design system da Axivero (skill `axivero-web`) e tokens já existentes em `app/globals.css`.
- E-mail do admin migrado: `marcelo.ferro@axivero.com.br` (conta atual `username = 'marcelo'`).
- Senha: mínimo de 12 caracteres, máximo de 1024 (`MIN_PASSWORD_LENGTH`, `MAX_PASSWORD_LENGTH` atuais).
- Convite vale 7 dias. Link de redefinição vale 1 hora. Ambos de uso único, guardados só como hash SHA-256.
- Fuso de referência para semana e "hoje": `America/Sao_Paulo`. Semana de segunda a domingo.
- Nome da sprint: `Semana dd/MM` (data da segunda-feira).
- Etapas fixas, nesta ordem e com estes nomes: `Backlog`, `A fazer`, `Fazendo`, `Feito`.
- Variáveis novas: `RESEND_API_KEY`, `EMAIL_FROM`, `APP_URL`. `MCP_TOKEN` continua aceito e age como o admin.
- Nenhum caminho (tela, rota, MCP, busca, sprint, dependências, histórico) pode revelar projeto de que o usuário não é membro. Projeto inacessível responde `PROJECT_NOT_FOUND`, card inacessível responde `CARD_NOT_FOUND`, nunca `FORBIDDEN`.
- Cada task termina com `pnpm test` verde e `pnpm exec tsc --noEmit` sem erros nos arquivos tocados.

## Review Focus

1. **Card de outro projeto por id:** um membro que conhece o id de um card de projeto alheio chama `/api/card/[id]`, `martrello_get_card`, `addDependency`, `moveCard` com `toProject` alheio ou a lista de candidatos a dependência. Esperado: `CARD_NOT_FOUND`/`PROJECT_NOT_FOUND`, sem vazar título. Testes na Task 5.
2. **Servidor fora do ar no fim de semana ou tick repetido:** o job de virada roda várias vezes, ou só na quarta-feira. Esperado: exatamente uma sprint aberta por usuário, na semana corrente, e um único fechamento da semana anterior. Testes na Task 7.
3. **E-mail com maiúsculas e espaços:** `" Marcelo.Ferro@Axivero.com.br "` faz login, e convidar o mesmo e-mail com outra caixa dá `EMAIL_TAKEN`. Testes nas Tasks 1 e 9.
4. **Link de convite ou redefinição reutilizado:** segundo uso, uso após expirar e uso do link antigo depois de "reenviar". Esperado: `TOKEN_INVALID` com a mensagem "Este link não é mais válido. Peça um novo." Testes na Task 9.
5. **Conta desativada com sessão e token do MCP abertos:** a próxima requisição da tela redireciona para `/login` e a próxima chamada do MCP responde 401. Testes nas Tasks 6 e 8.

---

## File Structure

| Arquivo | Responsabilidade |
|---|---|
| `lib/db/schema.ts` | Tabelas novas e colunas novas (todas as tasks de schema) |
| `lib/db/migrations/0005_*.sql` | Users: `email`, `name`, `role`, `disabled_at`; remove `username` |
| `lib/db/migrations/0006_*.sql` | Etapas, Backlog, responsável, `completed_at`, membros, eventos, tokens, sprints por usuário + dados |
| `lib/db/migrations/0007_*.sql` | Move "A fazer fora da sprint" para Backlog e remove `sprint_slots` |
| `lib/db/migrate-to.ts` | Helper de teste: aplica migrações até uma tag |
| `lib/access/actor.ts` | Tipo `Actor`, `SYSTEM_ACTOR`, `actorUserId` |
| `lib/access/guard.ts` | Visibilidade de projetos e cards, `assertAdmin` |
| `lib/core/stages.ts` | Etapas fixas e busca da lista de uma etapa |
| `lib/core/events.ts` | Registro e leitura do histórico de cards |
| `lib/core/members.ts` | Membros de projeto e desatribuição |
| `lib/core/week.ts` | Semana em America/Sao_Paulo |
| `lib/core/sprint.ts` | Sprint pessoal derivada, virada semanal, histórico |
| `lib/sprint-scheduler.ts` | Tick periódico da virada |
| `lib/auth/users.ts` | Usuários por e-mail, senha, papéis, desativação |
| `lib/auth/tokens.ts` | Convites e redefinição de senha |
| `lib/auth/mcp-tokens.ts` | Tokens pessoais do MCP e resolução do ator |
| `lib/email/mailer.ts`, `lib/email/templates.ts` | Envio pelo Resend e textos |
| `app/(app)/admin/*` | Área de admin |
| `app/(app)/conta/*` | Minha conta (tokens do MCP, troca de senha) |
| `app/convite/[token]`, `app/esqueci-senha`, `app/redefinir-senha/[token]` | Páginas públicas de senha |

---

### Task 1: Login por e-mail

**Files:**
- Modify: `lib/db/schema.ts` (tabela `users`), `lib/auth/users.ts`, `lib/auth/sessions.ts`, `lib/auth/login.ts`, `app/login/actions.ts`, `app/login/LoginForm.tsx`, `scripts/user-set.ts`
- Create: `lib/db/migrations/0005_*.sql` (gerada por `pnpm db:generate` e editada), `lib/db/migrate-to.ts`, `lib/db/migration-0005.test.ts`
- Test: `lib/auth/users.test.ts`, `lib/auth/sessions.test.ts`, `lib/auth/login.test.ts`

**Interfaces:**
- Produces:
  - `users`: `id`, `email` (unique, not null), `name` (not null), `passwordHash`, `role: 'admin' | 'member'` (not null, default `'member'`), `createdAt`, `disabledAt: number | null`.
  - `type Role = 'admin' | 'member'` exportado de `lib/db/schema.ts`.
  - `normalizeEmail(raw: string): string` (trim + lowercase).
  - `createUser(db, input: { email: string; name: string; password: string; role?: Role }): Promise<User>` (lança `EMAIL_TAKEN`).
  - `setUserPassword(db, userId: string, plain: string): Promise<void>` (encerra as sessões do usuário).
  - `findUserByEmail(db, email: string): Promise<User | undefined>`.
  - `authenticate(db, email, plain): Promise<SessionUser | null>` (null se desativado).
  - `type SessionUser = { id: string; email: string; name: string; role: Role }`.
  - `validateSession` retorna `null` para usuário com `disabledAt`.
  - `migrateTo(sqlite: Database.Database, lastTag: string): void` em `lib/db/migrate-to.ts`.

- [ ] **Step 1: Write the failing tests**

`lib/db/migration-0005.test.ts`:
```ts
it('0005 migra marcelo para admin com e-mail e mantém o hash', () => {
  const sqlite = new Database(':memory:');
  migrateTo(sqlite, '0004_bitter_dust');
  sqlite.prepare(`INSERT INTO users (id, username, password_hash, created_at) VALUES ('u1','marcelo','HASH',1)`).run();
  sqlite.prepare(`INSERT INTO users (id, username, password_hash, created_at) VALUES ('u2','outro','H2',1)`).run();
  migrateTo(sqlite, '0005'); // prefixo da tag gerada
  const m = sqlite.prepare(`SELECT * FROM users WHERE id='u1'`).get();
  expect(m).toMatchObject({ email: 'marcelo.ferro@axivero.com.br', name: 'Marcelo', role: 'admin', password_hash: 'HASH', disabled_at: null });
  expect(sqlite.prepare(`SELECT email, role FROM users WHERE id='u2'`).get()).toEqual({ email: 'outro', role: 'member' });
});
```
Em `lib/auth/users.test.ts` (substitui os testes de `username`):
```ts
it('login aceita e-mail com caixa e espaços diferentes', async () => {
  await createUser(db, { email: 'Ana@Axivero.com.br', name: 'Ana', password: 'x'.repeat(12) });
  expect(await authenticate(db, '  ana@AXIVERO.com.br ', 'x'.repeat(12))).toMatchObject({ email: 'ana@axivero.com.br', role: 'member' });
});
it('createUser com e-mail existente lança EMAIL_TAKEN', ...);       // expect code 'EMAIL_TAKEN'
it('authenticate devolve null para usuário desativado', ...);        // set disabledAt, expect null
it('setUserPassword encerra sessões', ...);                          // mantém o teste atual adaptado
```
Em `lib/auth/sessions.test.ts`: `it('validateSession devolve null quando o usuário foi desativado')`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test lib/auth lib/db`
Expected: FAIL (`createUser` não existe, coluna `email` não existe).

- [ ] **Step 3: Implement**

- Schema `users` conforme Interfaces. `pnpm db:generate` gera a recriação da tabela. Edite o `INSERT INTO __new_users ... SELECT` para:
  `email = CASE WHEN username = 'marcelo' THEN 'marcelo.ferro@axivero.com.br' ELSE username END`, `name = CASE WHEN username = 'marcelo' THEN 'Marcelo' ELSE username END`, `role = CASE WHEN username = 'marcelo' THEN 'admin' ELSE 'member' END`, `disabled_at = NULL`.
- `migrateTo`: copia `lib/db/migrations/*.sql` e `meta/_journal.json` para uma pasta temporária, mantendo só as entradas do journal até a primeira cuja `tag` começa com `lastTag`, e chama `migrate()` do drizzle nela.
- `MartrelloError`: adicione os códigos `EMAIL_TAKEN`, `USER_NOT_FOUND`, `FORBIDDEN`, `TOKEN_INVALID`, `ASSIGNEE_REQUIRED`, `ASSIGNEE_NOT_MEMBER`, `LISTS_ARE_FIXED` (usados nas tasks seguintes).
- Login: campo `email` (`type="email"`, `autoComplete="username"`), mensagem de erro "E-mail ou senha inválidos.".
- `scripts/user-set.ts <email>`: troca a senha de um usuário existente. Se não existir, pede o nome e cria como `admin` só quando não houver nenhum admin, senão `member`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test && pnpm exec tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/db lib/auth lib/errors.ts app/login scripts/user-set.ts
git commit -m "feat(auth): login por e-mail e papéis admin/membro"
```

---

### Task 2: Etapas fixas e schema do domínio

**Files:**
- Modify: `lib/db/schema.ts`, `lib/core/projects.ts`, `lib/core/lists.ts`, `mcp/tools/index.ts`, `scripts/seed.ts`
- Create: `lib/core/stages.ts`, `lib/db/migrations/0006_*.sql`, `lib/db/migration-0006.test.ts`
- Delete: `mcp/tools/lists.ts`
- Test: `lib/core/projects.test.ts`, `lib/core/lists.test.ts`

**Interfaces:**
- Produces:
  - `lists.stage: 'backlog' | 'todo' | 'doing' | 'done'` (not null, unique por `(project_id, stage)`).
  - `cards.assigneeId: string | null` (FK `users.id`, `ON DELETE SET NULL`), `cards.completedAt: number | null`.
  - `projectMembers`: `projectId`, `userId`, `addedAt`, PK `(projectId, userId)`, cascade nos dois FKs.
  - `cardEvents`: `id`, `cardId` (FK cascade), `actorId: string | null` (FK `SET NULL`), `type: string`, `fromValue: string | null`, `toValue: string | null`, `at: number`; índice por `cardId`.
  - `mcpTokens`: `id`, `userId` (FK cascade), `tokenHash` (unique), `name`, `createdAt`, `lastUsedAt`, `revokedAt`.
  - `authTokens`: `idHash` (PK), `kind: 'invite' | 'reset'`, `email`, `name: string | null`, `userId: string | null`, `createdBy: string | null`, `createdAt`, `expiresAt`, `usedAt`, `revokedAt`.
  - `sprints.userId: string | null` (FK cascade) e `sprints.weekStart: string | null` (`YYYY-MM-DD`). Ficam anuláveis no SQL por causa da migração. O core sempre preenche.
  - `lib/core/stages.ts`: `type Stage`, `STAGES: ReadonlyArray<{ stage: Stage; name: string }>` = `[backlog/'Backlog', todo/'A fazer', doing/'Fazendo', done/'Feito']`, `getStageList(db, projectId, stage): Promise<List>`, `resolveListRef(db, projectId, ref: string): Promise<List>` (aceita id, nome da lista ou nome da etapa).
  - `createProject` cria sempre as quatro listas com `stage`. O parâmetro `lists` sai.
  - `createList`, `renameList`, `deleteList`, `reorderLists` lançam `LISTS_ARE_FIXED`.

- [ ] **Step 1: Write the failing tests**

`lib/db/migration-0006.test.ts` (base: banco em `0005`, com `u1` admin `marcelo.ferro@axivero.com.br`, projeto P com listas `A fazer`/`Fazendo`/`Feito` nas posições 1000/2000/3000, cards c1 em A fazer, c2 em Feito com `updated_at = 50`, um card arquivado c3, sprint ativa S sem usuário):
```ts
expect(lists(P)).toEqual([['Backlog','backlog',0],['A fazer','todo',1000],['Fazendo','doing',2000],['Feito','done',3000]]);
expect(card('c1').assignee_id).toBe('u1'); expect(card('c3').assignee_id).toBe('u1');
expect(card('c2').completed_at).toBe(50); expect(card('c1').completed_at).toBeNull();
expect(members(P)).toEqual(['u1']);
expect(sprint('S').user_id).toBe('u1');
expect(events('c1')).toEqual([{ type: 'migrated', actor_id: null }]);
```
`it('0006 aborta sem alterar nada quando um projeto tem lista fora das três etapas')`: projeto com lista "Revisão" → `expect(() => migrateTo(sqlite, '0006')).toThrow()` e as tabelas antigas continuam iguais.

Em `lib/core/projects.test.ts`: `createProject` gera exatamente `['Backlog','A fazer','Fazendo','Feito']` com os `stage` correspondentes. Em `lib/core/lists.test.ts`: `createList` lança `LISTS_ARE_FIXED`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test lib/db lib/core/projects lib/core/lists`
Expected: FAIL.

- [ ] **Step 3: Implement**

Gere a migração com `pnpm db:generate` e acrescente à mão, depois do DDL, os passos de dados nesta ordem (todos usando `(SELECT id FROM users WHERE email = 'marcelo.ferro@axivero.com.br')` como `:admin`):
1. A recriação de `lists` copia `stage` com `CASE name WHEN 'A fazer' THEN 'todo' WHEN 'Fazendo' THEN 'doing' WHEN 'Feito' THEN 'done' END`. Nome fora disso vira NULL e a restrição NOT NULL aborta a migração inteira. É a parada exigida pela spec.
2. Insere uma lista `Backlog` (`stage = 'backlog'`, `position = 0`, id `lower(hex(randomblob(16)))`) por projeto.
3. `cards.assignee_id = :admin` para todos. `completed_at = updated_at` para cards em lista `done`.
4. `project_members (project, :admin)` para todo projeto, quando `:admin` existe.
5. `sprints.user_id = :admin`.
6. Um `card_events` `type = 'migrated'`, `actor_id = NULL`, `at` = horário da migração em ms, por card.

`sprint_slots` continua existindo até a Task 7. Remova `listTools` do MCP. Ajuste o seed para não passar `lists`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test && pnpm exec tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/db lib/core mcp scripts/seed.ts
git commit -m "feat(core): etapas fixas, responsável, membros e histórico no schema"
```

---

### Task 3: Ator, acesso e histórico

**Files:**
- Create: `lib/access/actor.ts`, `lib/access/guard.ts`, `lib/access/guard.test.ts`, `lib/core/events.ts`, `lib/core/events.test.ts`
- Modify: `lib/core/test-helpers.ts`, `lib/auth/current-user.ts`

**Interfaces:**
- Produces:
  - `type Actor = { kind: 'user'; id: string; role: Role } | { kind: 'system' }`, `SYSTEM_ACTOR`, `actorUserId(a: Actor): string | null`, `toActor(u: SessionUser): Actor`.
  - `seesAllProjects(a: Actor): boolean` (admin ou sistema).
  - `visibleProjectIds(db, a): Promise<string[] | null>` (`null` = todos).
  - `assertProjectVisible(db, a, projectId): Promise<void>` → `PROJECT_NOT_FOUND`.
  - `loadVisibleCard(db, a, cardId): Promise<Card>` → `CARD_NOT_FOUND`.
  - `assertAdmin(a): void` → `FORBIDDEN` com a mensagem "Só o admin pode fazer isso.".
  - `type CardEventType = 'created' | 'title' | 'description' | 'due_date' | 'stage' | 'project' | 'assignee' | 'label_added' | 'label_removed' | 'dependency_added' | 'dependency_removed' | 'archived' | 'unarchived' | 'migrated'`.
  - `recordCardEvent(db, e: { cardId: string; actor: Actor; type: CardEventType; from?: string | null; to?: string | null; at?: number }): void` (síncrono com `.run()`, usável dentro de `db.transaction`).
  - `listCardEvents(db, actor, cardId): Promise<Array<{ id: string; type: CardEventType; from: string | null; to: string | null; at: number; actorName: string | null }>>` em ordem cronológica, passando por `loadVisibleCard`.
  - Test helpers: `makeUser(db, opts?: { email?: string; name?: string; role?: Role }): Promise<{ user: User; actor: Actor }>` e `addMemberRow(db, projectId, userId): void`.
  - `requireActor(): Promise<{ user: SessionUser; actor: Actor }>` e `requireAdmin(): Promise<{ user; actor }>` (membro → `redirect('/')`).

- [ ] **Step 1: Write the failing tests**

```ts
it('membro só vê projetos de que é membro', ...);   // visibleProjectIds = [P1]
it('admin e sistema veem tudo', ...);                // null
it('loadVisibleCard de projeto alheio lança CARD_NOT_FOUND', ...);
it('assertAdmin com membro lança FORBIDDEN', ...);
it('listCardEvents traz nome do autor e null para o sistema, em ordem', ...);
it('requireAdmin redireciona membro para /', ...);   // mock de next/navigation redirect e da sessão
```

- [ ] **Step 2: Run** `pnpm test lib/access lib/core/events`. Expected: FAIL.
- [ ] **Step 3: Implement** conforme Interfaces.
- [ ] **Step 4: Run** `pnpm test && pnpm exec tsc --noEmit`. Expected: PASS.
- [ ] **Step 5: Commit** `git commit -m "feat(access): ator, visibilidade por membro e histórico de cards"`

---

### Task 4: Regras de card com responsável

**Files:**
- Modify: `lib/core/cards.ts`, `lib/core/labels.ts`, `lib/core/dependencies.ts`, `app/actions.ts`, `app/api/mcp/route.ts`, `mcp/server.ts`, `mcp/tools/*.ts`
- Create: `lib/core/assignee.ts`
- Test: `lib/core/cards.test.ts`, `lib/core/labels.test.ts`, `lib/core/dependencies.test.ts`, `mcp/tools/*.test.ts`

**Interfaces:**
- Consumes: Task 2 (`Stage`, `resolveListRef`, `getStageList`), Task 3 (`Actor`, guard, `recordCardEvent`).
- Produces:
  - `resolveAssignee(db, projectId, ref: string): Promise<User>`: aceita id, e-mail ou nome. Lança `ASSIGNEE_NOT_MEMBER` ("{ref} não é membro ativo deste projeto.") se não for membro ativo.
  - `createCard(db, actor, input: { project; list?; title; description?; dueDate?; labels?; assignee?: string }): Promise<Card>`. A lista padrão é o **Backlog**. `addToSprint` sai.
  - `updateCard(db, actor, id, patch)`, `moveCard(db, actor, id, target: { toProject?; toList: string; position?: number })`, `assignCard(db, actor, id, assignee: string | null): Promise<Card>`, `archiveCard(db, actor, id)`, `unarchiveCard(db, actor, id)`, `getCardById(db, actor, id)` (inclui `assignee: { id; name; email } | null` e `completedAt`).
  - Labels e dependências: as funções públicas ganham `actor` como segundo parâmetro. `deleteLabel` exige admin.
  - `getBlockedStatuses`: "concluída" = arquivada ou lista `stage = 'done'`.
  - `type ToolCtx = { actor: Actor }`. `MartrelloTool.handler: (input, ctx: ToolCtx) => Promise<unknown>`. `createServer(actor: Actor)`.
  - Rota MCP: o `MCP_TOKEN` atual vira o ator do primeiro admin (`role = 'admin'`, `disabledAt IS NULL`, `createdAt` mais antigo). Sem admin, responde 503 `{ error: 'NO_ADMIN' }`.

Regras (valem para tela e MCP):
- Fora do Backlog, um card sem responsável recebe o ator como responsável na criação ou no movimento. Se o ator for o sistema, lança `ASSIGNEE_REQUIRED` ("A tarefa precisa de um responsável para sair do Backlog.").
- `assignCard(..., null)` só é aceito com o card no Backlog. Fora dele, lança `ASSIGNEE_REQUIRED`.
- Entrar na etapa `done` grava `completedAt = now`. Sair dela grava `null`. Um movimento para `done` ignora `position`.
- `moveCard` com `toProject`: o ator precisa ver o destino. O responsável, se houver, precisa ser membro ativo do destino, senão `ASSIGNEE_NOT_MEMBER`.
- Membro não pode `createProject`, `updateProject`, `archiveProject` nem `reorderProjects` (`FORBIDDEN`).
- Toda mudança grava `recordCardEvent`, com o valor anterior e o novo. Para `stage`, o valor é o nome da etapa. Para `assignee`, o valor é o e-mail. Para `project`, o valor é o id.

- [ ] **Step 1: Write the failing tests** (`lib/core/cards.test.ts`, substituindo os que usam `addToSprint`):
```ts
it('cria no Backlog sem responsável por padrão', ...);           // stage backlog, assigneeId null
it('mover do Backlog para A fazer sem responsável atribui o ator', ...);
it('sistema movendo sem responsável lança ASSIGNEE_REQUIRED', ...);
it('assignCard com não-membro lança ASSIGNEE_NOT_MEMBER', ...);
it('assignCard(null) fora do Backlog lança ASSIGNEE_REQUIRED', ...);
it('entrar em Feito grava completedAt e sair limpa', ...);
it('mover para outro projeto exige responsável membro do destino', ...);
it('registra eventos created, stage e assignee com autor', ...);  // listCardEvents
it('membro não cria projeto (FORBIDDEN)', ...);
```
`dependencies.test.ts`: `it('bloqueador em Feito conta como concluído')`.

- [ ] **Step 2: Run** `pnpm test lib/core mcp`. Expected: FAIL.
- [ ] **Step 3: Implement.** As server actions trocam `requireUser()` por `requireActor()` e passam `actor`. As actions de sprint antigas continuam até a Task 7, chamando o core antigo sem ator.
- [ ] **Step 4: Run** `pnpm test && pnpm exec tsc --noEmit`. Expected: PASS.
- [ ] **Step 5: Commit** `git commit -m "feat(core): responsável obrigatório fora do Backlog, conclusão e histórico"`

---

### Task 5: Visibilidade em todas as leituras

**Files:**
- Modify: `lib/core/projects.ts` (`listProjects`, `getProjectByNameOrId` público), `lib/core/cards.ts` (`searchCards`), `app/api/card/[id]/route.ts`, `app/(app)/page.tsx`, `app/(app)/project/[id]/page.tsx`, `components/Sidebar.tsx`, `mcp/tools/read.ts`
- Test: `lib/core/visibility.test.ts` (novo), `mcp/tools/read.test.ts`

**Interfaces:**
- Produces:
  - `listProjects(db, actor, opts?)`, `getProject(db, actor, nameOrId): Promise<Project & { lists: List[] }>`. Ela é a versão pública e checa a visibilidade. `getProjectByNameOrId` sem ator fica só para uso interno do core.
  - `searchCards(db, actor, opts: { query; project?; label?; includeArchived?; assignee?: string | 'me' })`.
  - A rota `/api/card/[id]` usa `requireActor`, `loadVisibleCard`, e `candidateCards` só do mesmo projeto.

- [ ] **Step 1: Write the failing tests** (`lib/core/visibility.test.ts`, membro M só em P1, projeto pessoal P2 com card X):
```ts
it('listProjects do membro não inclui P2', ...);
it('getProject(P2) lança PROJECT_NOT_FOUND sem sugerir o nome de P2', ...); // suggestions vazias
it('searchCards não retorna X', ...);
it('getCardById(X) lança CARD_NOT_FOUND', ...);
it('addDependency de card de P1 com bloqueador X lança CARD_NOT_FOUND', ...);
it('moveCard para P2 lança PROJECT_NOT_FOUND', ...);
it('listCardEvents(X) lança CARD_NOT_FOUND', ...);
```
- [ ] **Step 2: Run** `pnpm test lib/core/visibility`. Expected: FAIL.
- [ ] **Step 3: Implement.** As sugestões de nome (`suggestClosest`) usam só os projetos visíveis. A página `/` redireciona para o primeiro projeto visível ou para `/sprint`.
- [ ] **Step 4: Run** `pnpm test && pnpm exec tsc --noEmit`. Expected: PASS.
- [ ] **Step 5: Commit** `git commit -m "feat(access): visibilidade por membro em todas as leituras"`

---

### Task 6: Membros de projeto e desativação

**Files:**
- Create: `lib/core/members.ts`, `lib/core/members.test.ts`, `lib/auth/admin-users.ts`, `lib/auth/admin-users.test.ts`
- Modify: `lib/core/projects.ts` (`createProject` adiciona o criador como membro)

**Interfaces:**
- Consumes: Task 3, Task 4.
- Produces:
  - `listMembers(db, actor, projectId): Promise<Array<{ id; name; email; disabled: boolean }>>`.
  - `addMember(db, actor, projectId, userId)` (admin, usuário ativo). `removeMember(db, actor, projectId, userId)` (admin).
  - `unassignOpenCards(db, actor, userId, projectId?: string): number`: cards ativos em `todo`/`doing` vão para o Backlog com `assigneeId = null` e evento `assignee` e `stage`. Feito e arquivados não mudam.
  - `listUsers(db, actor): Promise<Array<{ id; name; email; role; disabledAt; projectCount }>>` (admin).
  - `deactivateUser(db, actor, userId)`: admin. Não pode desativar a si mesmo nem outro admin (`FORBIDDEN`). Grava `disabledAt`, apaga sessões, revoga `mcpTokens`, chama `unassignOpenCards` e remove o usuário de `projectMembers`.
  - `reactivateUser(db, actor, userId)`: limpa `disabledAt`. Não devolve projetos nem tarefas.

- [ ] **Step 1: Write the failing tests**
```ts
it('removeMember devolve só as tarefas em A fazer/Fazendo ao Backlog sem responsável', ...);
it('desativar encerra sessões, revoga tokens e tira dos projetos', ...); // validateSession → null
it('reativar não devolve projetos', ...);
it('membro chamando addMember recebe FORBIDDEN', ...);
it('admin não pode se desativar', ...);
```
- [ ] **Step 2: Run** `pnpm test lib/core/members lib/auth/admin-users`. Expected: FAIL.
- [ ] **Step 3: Implement** conforme Interfaces. Cada função de escrita roda numa única `db.transaction`.
- [ ] **Step 4: Run** `pnpm test && pnpm exec tsc --noEmit`. Expected: PASS.
- [ ] **Step 5: Commit** `git commit -m "feat(admin): membros de projeto e desativação de contas"`

---

### Task 7: Sprint pessoal semanal

**Files:**
- Create: `lib/core/week.ts`, `lib/core/week.test.ts`, `lib/sprint-scheduler.ts`, `lib/db/migrations/0007_*.sql`, `lib/db/migration-0007.test.ts`
- Modify: `lib/core/sprint.ts` (reescrita), `lib/core/sprint.test.ts`, `lib/db/schema.ts` (remove `sprintSlots`), `instrumentation.ts`, `app/actions.ts`, `app/(app)/sprint/page.tsx`, `app/(app)/sprint/SprintClient.tsx`, `mcp/tools/read.ts`, `mcp/tools/index.ts`
- Delete: `mcp/tools/sprint.ts`, `mcp/tools/sprint.test.ts`

**Interfaces:**
- Produces:
  - `weekStartISO(now: Date): string`: a segunda-feira (`YYYY-MM-DD`) da data local em `America/Sao_Paulo`, via `Intl.DateTimeFormat('en-CA', { timeZone })`. `weekBounds(weekStart: string): { startMs: number; endMs: number }` (meia-noite de São Paulo, fim exclusivo). `sprintName(weekStart): string` → `Semana dd/MM`.
  - `ensureCurrentSprint(db, userId, now = new Date()): Promise<Sprint>`: idempotente. Se o usuário tem sprint aberta de semana anterior, ou aberta com `weekStart` nulo de antes da semana corrente, fecha com snapshot. Se não tem sprint da semana corrente, abre uma. Uma sprint legada com `weekStart` nulo e aberta na semana corrente recebe a `weekStart` corrente.
  - `getMySprint(db, actor, now?): Promise<Sprint & { cards: SprintCard[] }>`: as tarefas do ator em `todo` e `doing` (ativas, de projetos ativos), mais as em `done` com `completedAt` dentro da semana. Ordem dentro de cada etapa por `compareByDeadline`, que já existe.
  - `type SprintCard`: os campos atuais, com `stage: 'todo' | 'doing' | 'done'` no lugar de `sprintList`, mais `completedAt: number | null` e `projectId`.
  - `rolloverAllSprints(db, now?): Promise<number>`: chama `ensureCurrentSprint` para cada usuário ativo.
  - `listSprints(db, actor, opts)`, `getSprintHistory(db, actor, sprintId)`: só as sprints do próprio ator. Sprint de outro usuário → `SPRINT_NOT_FOUND`.
  - Snapshot no fechamento: os `SprintCard` da semana fechada. Na leitura do histórico, os cards de projetos que o ator não vê mais saem do resultado.
  - Saem: `startSprint`, `closeSprint`, `addToSprint`, `moveInSprint`, `removeFromSprint`, `getActiveSprintRow`, `getCardSprintState`, as actions correspondentes e as tools `martrello_start_sprint`, `martrello_add_to_sprint`, `martrello_move_in_sprint`, `martrello_remove_from_sprint` e `martrello_close_sprint`.
  - `martrello_get_sprint` devolve a sprint de quem chama.
  - Como a sprint é derivada, a entrada e a saída de sprint que a spec lista no histórico aparecem como os eventos `stage` e `assignee`, que já existem. Não há evento próprio de sprint.
  - `startSprintScheduler()`: tick imediato e depois a cada 15 min, chamando `rolloverAllSprints`. Roda sempre no runtime nodejs. O backup continua condicionado a `BACKUP_DIR`.

- [ ] **Step 1: Write the failing tests**

`week.test.ts`:
```ts
expect(weekStartISO(new Date('2026-11-16T02:59:00Z'))).toBe('2026-11-09'); // domingo 23:59 em SP
expect(weekStartISO(new Date('2026-11-16T03:00:00Z'))).toBe('2026-11-16'); // segunda 00:00 em SP
expect(sprintName('2026-11-16')).toBe('Semana 16/11');
```
`sprint.test.ts`:
```ts
it('tarefa em A fazer do ator aparece na sprint dele e não na de outro', ...);
it('Feito só mostra o concluído na semana', ...);
it('ensureCurrentSprint chamado 3 vezes na mesma semana deixa 1 sprint aberta', ...);
it('virada após dias fora do ar fecha a antiga uma vez e abre a da semana corrente', ...); // now = quarta
it('o fechamento guarda snapshot e não arquiva nada', ...);   // card em Feito continua ativo
it('getSprintHistory de sprint de outro usuário lança SPRINT_NOT_FOUND', ...);
```
`migration-0007.test.ts` (banco em `0006` com sprint ativa S de `u1` contendo c1 de A fazer, c2 de A fazer fora de S, c3 de Fazendo fora de S):
```ts
expect(stageOf('c1')).toBe('todo'); expect(stageOf('c2')).toBe('backlog'); expect(stageOf('c3')).toBe('doing');
expect(assignee('c2')).toBe('u1');
expect(tableExists('sprint_slots')).toBe(false);
```

- [ ] **Step 2: Run** `pnpm test lib/core/week lib/core/sprint lib/db`. Expected: FAIL.
- [ ] **Step 3: Implement.** Migração 0007 escrita à mão: (a) cards ativos em lista `todo` cujo id não está em `sprint_slots` da sprint com `closed_at IS NULL` vão para a lista `backlog` do mesmo projeto, cada um com um evento `stage` (`actor_id` NULL), (b) `DROP TABLE sprint_slots`. A página da sprint usa colunas `A fazer`, `Fazendo` e `Feito`. Arrastar entre colunas chama `moveCardAction(cardId, stage)`, que o `resolveListRef` aceita, e a lista no projeto do card muda. No estado vazio, o texto passa a ser "Nenhuma tarefa sua em A fazer, Fazendo ou Feito nesta semana.".
- [ ] **Step 4: Run** `pnpm test && pnpm exec tsc --noEmit`. Expected: PASS.
- [ ] **Step 5: Commit** `git commit -m "feat(sprint): sprint pessoal semanal automática derivada das etapas"`

---

### Task 8: Tokens do MCP por pessoa

**Files:**
- Create: `lib/auth/mcp-tokens.ts`, `lib/auth/mcp-tokens.test.ts`
- Modify: `app/api/mcp/route.ts`, `app/api/mcp/route.test.ts`, `mcp/index.ts`, `mcp/tools/cards.ts`, `mcp/tools/read.ts`
- Delete: `lib/auth/mcp-token.ts` (substituído) e o teste correspondente

**Interfaces:**
- Produces:
  - `createMcpToken(db, userId, name: string): Promise<{ id: string; token: string }>`: `token = 'mtr_' + randomBytes(32).toString('base64url')`. Só o SHA-256 fica guardado.
  - `listMcpTokens(db, userId): Promise<Array<{ id; name; createdAt; lastUsedAt; revokedAt }>>`. `revokeMcpToken(db, userId, tokenId)`.
  - `resolveMcpActor(db, request: Request, envToken: string | undefined): Promise<Actor | Response>`: bearer igual a `MCP_TOKEN` → admin (como na Task 4). Senão, procura o hash: não revogado e usuário ativo. Atualiza `lastUsedAt`. Senão, responde 401 `{ error: 'UNAUTHORIZED' }`.
  - `mcp/index.ts` (stdio, uso local): age como o primeiro admin. Sem admin, encerra com "nenhum admin no banco".
  - Tools novas: `martrello_assign_card { id, assignee: string | null }` e `martrello_get_card_history { id }`. `martrello_create_card` ganha `assignee`. `martrello_search_cards` ganha `assignee` (`'me'` ou e-mail). As descrições citam a regra "fora do Backlog precisa de responsável. Sem `assignee`, fica com quem chama.".

- [ ] **Step 1: Write the failing tests**
```ts
it('token pessoal age como o dono: membro não vê projeto alheio via list_projects', ...);
it('token revogado → 401', ...);
it('token de usuário desativado → 401', ...);
it('MCP_TOKEN de ambiente age como admin', ...);
it('create_card com list "A fazer" sem assignee fica com quem chamou', ...);
```
- [ ] **Step 2: Run** `pnpm test lib/auth/mcp-tokens app/api/mcp mcp`. Expected: FAIL.
- [ ] **Step 3: Implement** conforme Interfaces.
- [ ] **Step 4: Run** `pnpm test && pnpm exec tsc --noEmit`. Expected: PASS.
- [ ] **Step 5: Commit** `git commit -m "feat(mcp): tokens pessoais e identidade nas ferramentas"`

---

### Task 9: Convites, "Esqueci minha senha" e e-mail

**Files:**
- Create: `lib/auth/tokens.ts`, `lib/auth/tokens.test.ts`, `lib/email/mailer.ts`, `lib/email/mailer.test.ts`, `lib/email/templates.ts`, `app/convite/[token]/page.tsx`, `app/esqueci-senha/page.tsx`, `app/redefinir-senha/[token]/page.tsx`, `app/(public-auth)/actions.ts` (actions das três páginas)
- Modify: `lib/auth/access.ts` e `lib/auth/access.test.ts` (rotas públicas), `app/login/LoginForm.tsx` (link "Esqueci minha senha"), `lib/auth/rate-limit.ts` (instância `resetLimiter`)

**Interfaces:**
- Produces:
  - `INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000`, `RESET_TTL_MS = 60 * 60 * 1000`.
  - `createInvite(db, actor, input: { email; name }, now?): Promise<{ inviteId: string; token: string }>`: admin. `EMAIL_TAKEN` se existir usuário com o e-mail, ativo ou desativado. Revoga convites pendentes do mesmo e-mail.
  - `resendInvite(db, actor, inviteId, now?): Promise<{ inviteId; token }>`: revoga o anterior e cria outro com prazo novo. `cancelInvite(db, actor, inviteId)`.
  - `listPendingInvites(db, actor): Promise<Array<{ inviteId; email; name; createdAt; expiresAt }>>`. `inviteId` = `idHash`.
  - `peekToken(db, kind, token, now?): Promise<{ email: string; name: string | null } | null>`.
  - `acceptInvite(db, token, password, now?): Promise<SessionUser>`: cria o usuário `member` e marca `usedAt`. `TOKEN_INVALID` se o token foi usado, revogado ou expirou.
  - `requestPasswordReset(db, email, now?): Promise<string | null>`: devolve o token só para usuário ativo.
  - `resetPassword(db, token, password, now?): Promise<SessionUser>`: usa `setUserPassword`, que encerra as sessões.
  - `sendEmail(msg: { to: string; subject: string; text: string; html: string }): Promise<'sent' | 'disabled'>`: `POST https://api.resend.com/emails` com `Authorization: Bearer ${RESEND_API_KEY}` e `from: EMAIL_FROM`. Sem `RESEND_API_KEY`, devolve `'disabled'`. Resposta não-2xx lança erro com o status.
  - `appUrl(path: string): string`, usando `APP_URL` (sem barra final).
  - `decideAccess` libera `/convite/*`, `/esqueci-senha` e `/redefinir-senha/*` com e sem login.

Textos fixos:
- Mensagem de token inválido: "Este link não é mais válido. Peça um novo."
- Resposta do "Esqueci minha senha", sempre a mesma: "Se este e-mail tiver uma conta, enviamos um link para criar uma senha nova."
- Assunto do convite: "Convite para o Martrello". Assunto da redefinição: "Redefinir sua senha do Martrello".

- [ ] **Step 1: Write the failing tests**
```ts
it('aceitar convite cria membro e o link não funciona de novo', ...);       // 2º uso → TOKEN_INVALID
it('convite expira em 7 dias', ...);                                        // now + 7d + 1 → TOKEN_INVALID
it('reenviar invalida o link anterior', ...);
it('convidar e-mail existente com outra caixa → EMAIL_TAKEN', ...);
it('reset vale 1 hora e encerra as outras sessões', ...);
it('requestPasswordReset de e-mail inexistente ou desativado devolve null', ...);
it('sendEmail sem RESEND_API_KEY devolve disabled e não chama fetch', ...);
it('sendEmail monta o POST do Resend', ...);                                // vi.stubGlobal('fetch')
```
`access.test.ts`: as três rotas novas dão `allow` sem login.
- [ ] **Step 2: Run** `pnpm test lib/auth lib/email`. Expected: FAIL.
- [ ] **Step 3: Implement.** As páginas validam o token com `peekToken`. Inválido mostra a mensagem fixa e um link para `/login`. O formulário pede a senha duas vezes. Aceitar o convite ou redefinir cria a sessão e redireciona para `/`. O "Esqueci minha senha" aplica `resetLimiter` por IP e por e-mail normalizado e responde a mensagem fixa em qualquer caso.
- [ ] **Step 4: Run** `pnpm test && pnpm exec tsc --noEmit`. Expected: PASS.
- [ ] **Step 5: Commit** `git commit -m "feat(auth): convite por e-mail e redefinição de senha via Resend"`

---

### Task 10: Quadro, card e sprint na interface

**Files:**
- Modify: `app/(app)/project/[id]/page.tsx`, `components/Board.tsx`, `components/List.tsx`, `components/Card.tsx`, `components/Card.test.ts`, `components/CardPanel.tsx`, `components/QuickCreate.tsx`, `app/api/card/[id]/route.ts`, `app/actions.ts`
- Delete: `components/SprintToggle.tsx`

**Interfaces:**
- Consumes: Tasks 4, 5, 7.
- Produces:
  - `CardData` ganha `assignee: { name: string } | null` e `completedAt: number | null`. `inSprint` sai.
  - Actions novas: `assignCardAction(cardId: string, assignee: string | null)` e `getCardHistoryAction(cardId)`. A rota `/api/card/[id]` passa a devolver também `members` e `history`.

Comportamento:
- O quadro tem as quatro colunas na ordem das etapas.
- A coluna Feito ordena por `completedAt` desc. Cada card ali mostra "Concluída em dd/MM". Não dá para reordenar à mão dentro de Feito.
- O card mostra as iniciais do responsável. Tarefa sem responsável não mostra nada.
- O painel do card tem um seletor de responsável, com os membros ativos e, só no Backlog, a opção "Sem responsável". Ele mostra também o histórico em ordem cronológica, cada linha com autor ("Sistema" quando `actorName` é null), o que mudou e a data/hora.
- Um erro do core vindo de uma action (`ASSIGNEE_NOT_MEMBER` etc.) aparece no painel com a mensagem do erro.

- [ ] **Step 1: Write the failing test** em `components/Card.test.ts`, seguindo o padrão atual do arquivo: `it('mostra as iniciais do responsável')` e `it('mostra Concluída em 12/11 para card em Feito')`.
- [ ] **Step 2: Run** `pnpm test components`. Expected: FAIL.
- [ ] **Step 3: Implement** conforme o Comportamento, com o visual do design system Axivero.
- [ ] **Step 4: Verify.** `pnpm test && pnpm exec tsc --noEmit`, depois `preview_start` do servidor de dev com `pnpm seed` e duas contas (`user-set`). Checar: Backlog aparece, mover para A fazer sem responsável atribui você, Feito fica no topo com a data, o histórico aparece no painel, a sprint mostra as colunas novas.
- [ ] **Step 5: Commit** `git commit -m "feat(ui): Backlog, responsável, conclusão e histórico no quadro"`

---

### Task 11: Área de admin e Minha conta

**Files:**
- Create: `app/(app)/admin/page.tsx`, `app/(app)/admin/actions.ts`, `app/(app)/admin/PeopleSection.tsx`, `app/(app)/admin/ProjectMembersSection.tsx`, `app/(app)/conta/page.tsx`, `app/(app)/conta/actions.ts`
- Modify: `components/SidebarClient.tsx` (links "Admin", só para admin, e "Minha conta")

**Interfaces:**
- Consumes: Task 6 (`listUsers`, `deactivateUser`, `reactivateUser`, `addMember`, `removeMember`, `listMembers`), Task 8 (`createMcpToken`, `listMcpTokens`, `revokeMcpToken`), Task 9 (`createInvite`, `resendInvite`, `cancelInvite`, `listPendingInvites`, `sendEmail`, `appUrl`).
- Produces: actions `inviteAction({ email, name })`, `resendInviteAction(inviteId)`, `cancelInviteAction(inviteId)`, `deactivateUserAction(userId)`, `reactivateUserAction(userId)`, `addMemberAction(projectId, userId)`, `removeMemberAction(projectId, userId)`, `createMcpTokenAction(name)`, `revokeMcpTokenAction(id)`, `changePasswordAction(current, next)`. Todas as de admin começam por `requireAdmin()`.

Comportamento:
- `/admin` tem duas seções: **Pessoas** (ativas, convites pendentes, desativadas) e **Projetos** (membros por projeto). Os nomes dos projetos seguem a regra de privacidade do botão de olho.
- Convidar e reenviar mandam o e-mail. Quando `sendEmail` devolve `'disabled'`, a tela mostra o link `appUrl('/convite/' + token)` com botão de copiar.
- Desativar pede confirmação: "Desativar {nome}? A pessoa perde o acesso agora e as tarefas em A fazer e Fazendo voltam para o Backlog."
- `/conta` lista os tokens do MCP. O token novo aparece uma única vez, com o aviso "Copie agora. Ele não será mostrado de novo.". A página também tem um formulário de troca de senha.
- Um membro que acessa `/admin` é redirecionado para `/`.

A regra de acesso já está testada no core (Tasks 3, 6, 8 e 9). Esta task é só de interface e é verificada no navegador.

- [ ] **Step 1: Implement** conforme o Comportamento.
- [ ] **Step 2: Run** `pnpm test && pnpm exec tsc --noEmit`. Expected: PASS.
- [ ] **Step 3: Verify** no preview: convidar sem `RESEND_API_KEY` mostra o link. Abrir o link numa janela anônima, definir a senha, adicionar a pessoa a um projeto e confirmar que ela só vê esse projeto. Desativar e confirmar que a sessão dela cai. Gerar e revogar um token do MCP.
- [ ] **Step 4: Commit** `git commit -m "feat(admin): área de admin e página Minha conta"`

---

### Task 12: Documentação e runbook de produção

**Files:**
- Modify: `PRODUCT.md`, `docs/deploy.md`, `README.md` (se citar `username` ou `user:set <username>`)

- [ ] **Step 1:** `PRODUCT.md`: usuários (time da Axivero, admin único, membros por convite), posicionamento (sem "um quadro de uma pessoa só"), capacidades (membros, responsável, sprint pessoal semanal, histórico) e restrições.
- [ ] **Step 2:** `docs/deploy.md`: variáveis `RESEND_API_KEY`, `EMAIL_FROM`, `APP_URL`. Verificação do domínio no Resend. `node dist/scripts/user-set.js <email>`. Como gerar o token pessoal do MCP e trocar o `claude mcp add`.
- [ ] **Step 3:** `docs/deploy.md`, seção "Migração multiusuário (uma vez)": (1) backup manual com `node dist/scripts/backup.js`, (2) deploy, (3) conferir nos logs `migrations applied`, (4) logar com `marcelo.ferro@axivero.com.br` e a senha atual, (5) conferir que a sprint tem as mesmas tarefas de antes. Se a migração abortar por lista fora das etapas, o log mostra o erro de NOT NULL em `lists.stage`. Nesse caso, renomear ou mover a lista e fazer o deploy de novo.
- [ ] **Step 4: Run** `pnpm test && pnpm build && pnpm scripts:build`. Expected: tudo verde.
- [ ] **Step 5: Commit** `git commit -m "docs: produto multiusuário e runbook da migração"`
