# Bot do Slack de vencimentos — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Todo dia útil, a partir das 9h de Brasília, mandar no canal do Slack de cada projeto configurado uma mensagem com as tarefas atrasadas, as que vencem hoje e (no primeiro dia útil da semana) as do resto da semana, marcando o responsável.

**Architecture:** Funções puras para calendário (feriados, dia útil, relógio de São Paulo) e para montar o texto da mensagem; um cliente HTTP fino para a Web API do Slack; uma tabela `slack_deliveries` (uma linha por projeto por dia) que garante no máximo um envio por dia; um runner que junta tudo, chamado por um agendador de 15 em 15 minutos iniciado em `instrumentation.ts`. O canal é escolhido no `/admin` numa lista dos canais em que o bot está.

**Tech Stack:** Next.js 16 (App Router, server actions), SQLite + Drizzle (`better-sqlite3`), Vitest, `fetch` nativo para a Slack Web API (sem SDK).

**Spec:** `docs/superpowers/specs/2026-11-13-slack-bot-vencimentos-design.md`

## Global Constraints

- Fuso: `America/Sao_Paulo`. Janela de envio: hora local `>= 9` e `< 12`. Tick a cada 15 min (`15 * 60 * 1000`).
- Dia útil: segunda a sexta, exceto feriados nacionais fixos (1/1, 21/4, 1/5, 7/9, 12/10, 2/11, 15/11, 20/11, 25/12) e móveis (Páscoa −48, −47, −2, +60). Quarta-feira de Cinzas é dia útil.
- Variável `SLACK_BOT_TOKEN`. O agendador só inicia com `NODE_ENV === 'production'` **e** `SLACK_BOT_TOKEN` não vazio.
- Escopos do bot: `chat:write`, `users:read`, `users:read.email`, `channels:read`, `groups:read`.
- Tarefas consideradas: do projeto, `archived_at IS NULL`, `due_date IS NOT NULL`, em lista com `stage <> 'done'` (inclui Backlog). Projeto com `archived_at` não recebe.
- No máximo uma mensagem por projeto por dia, inclusive após reinício. Resultado ambíguo nunca é reenviado.
- Tentar de novo (até as 12h) só quando: erro de conexão antes do envio (`ENOTFOUND`, `EAI_AGAIN`, `ECONNREFUSED`, `UND_ERR_CONNECT_TIMEOUT`), HTTP 5xx, HTTP 429 ou `ok:false` com `error: 'ratelimited'`. Qualquer outro erro encerra o dia.
- Logs com prefixo `[slack] `. O agendador nunca lança.
- Migração: só `CREATE TABLE` e `ALTER TABLE … ADD` (nunca rebuild de tabela existente; ver o cabeçalho de `0007_sprint_pessoal.sql`).
- Textos visíveis em pt-BR. UI segue as classes já usadas no admin (`field`, `btn`, `text-mt-*`) e a skill `axivero-web`.
- Testes: `pnpm test` (Vitest). Commits terminam com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Título de card com `<`, `>`, `&` ou `<!channel>`**: não pode virar menção nem quebrar a formatação. Coberto em Task 3 (`escapa título e nome`).
2. **Responsável cujo e-mail não existe no Slack, ou busca que falha**: a linha sai com o nome sem @ e a mensagem é enviada. Coberto em Task 5 (`busca de e-mail que falha vira nome`).
3. **App que reinicia no meio do dia**: depois de "sent" não manda de novo; um "sending" deixado por um tick anterior vira "failed" e não é reenviado. Coberto em Task 5 (`não repete após reinício` e `sending antigo vira failed`).
4. **Fronteiras do relógio**: 8h59 não envia, 9h00 envia, 11h59 envia, 12h00 não envia; 01:00Z de terça ainda é segunda em São Paulo. Coberto em Task 1 (`saoPauloClock`) e Task 5 (`janela 9h–12h`).
5. **Canal configurado que sumiu da lista do bot** (bot removido ou canal arquivado): o admin mostra o canal salvo como "indisponível"; o envio falha com `not_in_channel` ou `channel_not_found` e não tenta de novo. Coberto em Task 5 (`erro permanente encerra o dia`) e Task 7 (`channelOptions marca indisponível`).

---

## Mapa de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `lib/core/week.ts` (modificar) | + relógio de São Paulo e aritmética de datas ISO |
| `lib/core/holidays.ts` (novo) | Páscoa, feriados nacionais, dia útil, primeiro dia útil da semana |
| `lib/db/schema.ts` (modificar) | + `projects.slackChannelId/slackChannelName`, + tabela `slackDeliveries` |
| `lib/db/migrations/0008_slack_bot.sql` (gerado) | migração |
| `lib/core/slack-deliveries.ts` (novo) | alvos do dia, reserva/conclusão do envio, status para o admin |
| `lib/core/projects.ts` (modificar) | + `setProjectSlackChannel` |
| `lib/core/due-cards.ts` (novo) | consulta das tarefas com prazo de um projeto |
| `lib/core/due-digest.ts` (novo) | agrupar e renderizar a mensagem (puro) |
| `lib/slack/client.ts` (novo) | cliente da Web API e classificação de erros |
| `lib/slack/digest-runner.ts` (novo) | um tick: decide, monta, envia, registra |
| `lib/slack-scheduler.ts` (novo) | `setInterval` + guarda de sobreposição |
| `instrumentation.ts` (modificar) | inicia o agendador |
| `app/(app)/admin/*` (modificar/novo) | seletor de canal, status, action |
| `docs/deploy.md`, `PRODUCT.md` (modificar) | criação do app do Slack, variável, avisos |

---

### Task 1: Relógio de São Paulo, feriados e dia útil

**Files:**
- Modify: `lib/core/week.ts`
- Create: `lib/core/holidays.ts`
- Test: `lib/core/week.test.ts`, `lib/core/holidays.test.ts`

**Interfaces:**
- Produces (em `lib/core/week.ts`):
  - `saoPauloClock(now: Date): { date: string; hour: number }` — `date` é `YYYY-MM-DD` em São Paulo, `hour` 0–23.
  - `addDaysISO(iso: string, n: number): string`
  - `isoWeekday(iso: string): number` — 1 = segunda … 7 = domingo.
- Produces (em `lib/core/holidays.ts`):
  - `easterSunday(year: number): string`
  - `nationalHolidays(year: number): Set<string>`
  - `isBusinessDay(iso: string): boolean`
  - `isFirstBusinessDayOfWeek(iso: string): boolean` — `iso` é dia útil e nenhum dia útil o precede desde a segunda da mesma semana.

- [ ] **Step 1: Testes que falham**

```ts
// lib/core/week.test.ts (acrescentar)
it('saoPauloClock usa a data e a hora de São Paulo', () => {
  expect(saoPauloClock(new Date('2026-11-16T11:59:00Z'))).toEqual({ date: '2026-11-16', hour: 8 });
  expect(saoPauloClock(new Date('2026-11-16T12:00:00Z'))).toEqual({ date: '2026-11-16', hour: 9 });
  expect(saoPauloClock(new Date('2026-11-17T01:00:00Z'))).toEqual({ date: '2026-11-16', hour: 22 });
});
it('addDaysISO e isoWeekday', () => {
  expect(addDaysISO('2026-12-31', 1)).toBe('2027-01-01');
  expect(addDaysISO('2026-11-16', -3)).toBe('2026-11-13');
  expect(isoWeekday('2026-11-16')).toBe(1);
  expect(isoWeekday('2026-11-22')).toBe(7);
});

// lib/core/holidays.test.ts
it('easterSunday', () => {
  expect(easterSunday(2025)).toBe('2025-04-20');
  expect(easterSunday(2026)).toBe('2026-04-05');
  expect(easterSunday(2027)).toBe('2027-03-28');
});
it('feriados móveis de 2026', () => {
  const h = nationalHolidays(2026);
  for (const d of ['2026-02-16', '2026-02-17', '2026-04-03', '2026-06-04']) expect(h.has(d)).toBe(true);
  expect(h.has('2026-02-18')).toBe(false); // Cinzas
});
it('feriados fixos', () => {
  const h = nationalHolidays(2026);
  for (const d of ['2026-01-01','2026-04-21','2026-05-01','2026-09-07','2026-10-12','2026-11-02','2026-11-15','2026-11-20','2026-12-25']) expect(h.has(d)).toBe(true);
});
it('isBusinessDay', () => {
  expect(isBusinessDay('2026-11-16')).toBe(true);  // segunda comum
  expect(isBusinessDay('2026-11-14')).toBe(false); // sábado
  expect(isBusinessDay('2026-11-20')).toBe(false); // Consciência Negra
  expect(isBusinessDay('2026-02-18')).toBe(true);  // Cinzas
});
it('isFirstBusinessDayOfWeek', () => {
  expect(isFirstBusinessDayOfWeek('2026-11-16')).toBe(true);
  expect(isFirstBusinessDayOfWeek('2026-11-17')).toBe(false);
  expect(isFirstBusinessDayOfWeek('2026-11-03')).toBe(true);  // segunda 02/11 é Finados
  expect(isFirstBusinessDayOfWeek('2026-02-18')).toBe(true);  // seg e ter de Carnaval
  expect(isFirstBusinessDayOfWeek('2026-11-14')).toBe(false); // sábado
});
```

- [ ] **Step 2:** `pnpm test lib/core/week.test.ts lib/core/holidays.test.ts` → FAIL (funções não existem).
- [ ] **Step 3: Implementar.** `saoPauloClock` reaproveita o `clockFormat` já existente em `week.ts` (atenção: `hourCycle: 'h23'`). `addDaysISO`/`isoWeekday` usam o `utcDay`/`isoOf` existentes. `easterSunday` pelo algoritmo de Meeus/Jones/Butcher (gregoriano anônimo). Feriados móveis: Páscoa −48, −47, −2, +60. `isBusinessDay`: `isoWeekday <= 5` e não está em `nationalHolidays(ano)`.
- [ ] **Step 4:** mesmos testes → PASS.
- [ ] **Step 5: Commit** `feat(core): relógio de São Paulo, feriados nacionais e dia útil`.

---

### Task 2: Schema, migração e registro de envios

**Files:**
- Modify: `lib/db/schema.ts`, `lib/core/projects.ts`
- Create: `lib/db/migrations/0008_slack_bot.sql` (+ snapshot/journal gerados), `lib/core/slack-deliveries.ts`, `lib/core/due-cards.ts`
- Test: `lib/core/slack-deliveries.test.ts`, `lib/core/due-cards.test.ts`, `lib/core/projects.test.ts` (acrescentar)

**Interfaces:**
- Schema:
  - `projects.slackChannelId: text('slack_channel_id')` e `projects.slackChannelName: text('slack_channel_name')`, ambos nullable.
  - `slackDeliveries = sqliteTable('slack_deliveries', { projectId: text('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }), day: text('day').notNull() /* YYYY-MM-DD SP */, status: text('status', { enum: ['sending','sent','empty','retry','failed'] }).notNull(), attempts: integer('attempts').notNull(), error: text('error'), updatedAt: integer('updated_at').notNull() }, pk (projectId, day))`.
  - `export type DeliveryStatus = 'sending' | 'sent' | 'empty' | 'retry' | 'failed'`.
- Produces (`lib/core/slack-deliveries.ts`, sem actor — só o runner e o admin usam):
  - `listDigestTargets(db: Db): Promise<{ id: string; name: string; channelId: string }[]>` — projetos não arquivados com `slackChannelId`.
  - `claimDelivery(db: Db, projectId: string, day: string, now: number): boolean` — síncrono. Sem linha → insere `sending`, `attempts = 1`, devolve `true`. Linha `retry` → `UPDATE … SET status='sending', attempts=attempts+1 WHERE status='retry'`, devolve `changes > 0`. Qualquer outro status → `false`.
  - `finishDelivery(db: Db, projectId: string, day: string, status: 'sent' | 'empty' | 'retry' | 'failed', error: string | null, now: number): void`
  - `failStaleSending(db: Db, day: string, now: number): number` — toda linha `sending` do dia vira `failed` com `error = 'interrupted'`; devolve quantas.
  - `deliveryStatuses(db: Db): Promise<Map<string, ProjectDeliveryStatus>>` com `type ProjectDeliveryStatus = { latest: { day: string; status: DeliveryStatus; error: string | null; at: number } | null; lastSentAt: number | null }`.
- Produces (`lib/core/projects.ts`):
  - `setProjectSlackChannel(db: Db, actor: Actor, projectId: string, channel: { id: string; name: string } | null): Promise<void>` — `assertAdmin`; projeto inexistente → `MartrelloError('PROJECT_NOT_FOUND', …)` (código já usado em `projects.ts`).
- Produces (`lib/core/due-cards.ts`):
  - `type DueCard = { title: string; dueDate: string; position: number; assigneeEmail: string | null; assigneeName: string | null }`
  - `listDueCards(db: Db, projectId: string): Promise<DueCard[]>` — regra de "Tarefas consideradas" das Global Constraints, `LEFT JOIN users`.

- [ ] **Step 1: Testes que falham** (usar `makeTestDb`, `makeUser`, `createProject` de `test-helpers`/`projects`):
  - `slack-deliveries.test.ts`:
    - `claimDelivery reserva uma vez por dia`: 1ª chamada `true`, 2ª `false`; outro dia `true`.
    - `retry pode ser reclamado de novo e conta tentativas`: claim → finish `retry` → claim `true` → linha com `attempts = 2`, `status = 'sending'`.
    - `sent, empty e failed não são reclamados`: para cada um, claim após finish → `false`.
    - `failStaleSending marca sending do dia como failed/interrupted`: devolve `1`; não toca linhas de outro dia.
    - `listDigestTargets ignora projeto sem canal e arquivado`.
    - `deliveryStatuses`: com `sent` em 13/11 e `failed` em 16/11 → `latest.status === 'failed'`, `lastSentAt` = horário do 13/11.
  - `due-cards.test.ts`:
    - `inclui Backlog sem responsável e exclui Feito, arquivada e sem prazo`: cria cards em cada caso; só os esperados voltam, com `assigneeEmail`/`assigneeName` preenchidos ou `null`.
  - `projects.test.ts`: `setProjectSlackChannel grava e limpa; membro recebe FORBIDDEN`.
- [ ] **Step 2:** `pnpm test lib/core` → FAIL.
- [ ] **Step 3: Schema + migração.** Editar `schema.ts`, rodar `pnpm db:generate --name slack_bot`. Conferir que o SQL gerado tem só `CREATE TABLE slack_deliveries` e dois `ALTER TABLE projects ADD …` (sem `__new_projects`). Se o drizzle-kit gerar rebuild, reescrever à mão como `ALTER TABLE … ADD`.
- [ ] **Step 4: Implementar** `slack-deliveries.ts`, `due-cards.ts` e `setProjectSlackChannel`. `claimDelivery`, `finishDelivery` e `failStaleSending` são síncronos (`.run()`), para a reserva ser atômica no SQLite.
- [ ] **Step 5:** `pnpm test` → PASS (todos, incluindo os de migração existentes).
- [ ] **Step 6: Commit** `feat(db): canal do Slack por projeto e registro de envios`.

---

### Task 3: Montar e escrever a mensagem (puro)

**Files:**
- Create: `lib/core/due-digest.ts`
- Test: `lib/core/due-digest.test.ts`

**Interfaces:**
- Consumes: `DueCard` (Task 2), `addDaysISO`, `isoWeekday`, `weekStartISO`/aritmética (Task 1).
- Produces:
  - `type Digest = { overdue: DueCard[]; today: DueCard[]; week: DueCard[] }`
  - `buildDigest(cards: DueCard[], today: string, includeWeek: boolean): Digest` — overdue `< today`; today `=== today`; week `today < due <= domingo da semana de today` só se `includeWeek`, senão `[]`. Cada grupo ordenado por `dueDate`, depois `position`.
  - `isEmptyDigest(d: Digest): boolean`
  - `renderDigest(d: Digest, opts: { projectName: string; today: string; boardUrl: string; slackIdByEmail: Map<string, string> }): string`

Texto exato (blocos separados por linha em branco; grupo vazio omitido):

```
*Prazos de hoje · {projectName}* — {diaLongo}, {dd/mm}

🔴 *Atrasadas ({n})*
• {título} — {quem} · venceu {diaCurto} {dd/mm}

🟡 *Vencem hoje ({n})*
• {título} — {quem}

🗓️ *Resto da semana ({n})*
• {diaCurto} {dd/mm} — {título} — {quem}

<{boardUrl}|Abrir quadro>
```

- `diaLongo`: segunda, terça, quarta, quinta, sexta, sábado, domingo. `diaCurto`: seg, ter, qua, qui, sex, sáb, dom.
- `quem`: `<@{slackId}>` se o e-mail estiver no mapa; senão o nome do martrello; sem responsável → `sem responsável`.
- Escapar `&` → `&amp;`, `<` → `&lt;`, `>` → `&gt;` em título, nome do projeto e nome da pessoa.

- [ ] **Step 1: Testes que falham**
  - `agrupa por prazo e só inclui a semana quando pedido`: hoje `2026-11-16`; cards em 12/11, 16/11, 18/11, 22/11 (domingo) e 23/11 → com `includeWeek=true`: overdue 1, today 1, week 2 (23/11 fora); com `false`: week `[]`.
  - `ordena por data e depois posição`.
  - `isEmptyDigest`.
  - `renderiza o exemplo da spec`: monta o digest da seção 5 da spec (Motim, segunda 16/11, Ana/Bruno/Marcelo no mapa, uma tarefa sem responsável) e compara com a string exata, usando `<@UANA>` etc. no lugar de `@Ana`.
  - `sem bloco de semana de terça a sexta`: render com `week: []` não contém `🗓️`.
  - `escapa título e nome`: título `a <!channel> & b` → contém `a &lt;!channel&gt; &amp; b` e não contém `<!channel>`.
  - `e-mail fora do mapa vira nome sem @`.
- [ ] **Step 2:** `pnpm test lib/core/due-digest.test.ts` → FAIL.
- [ ] **Step 3: Implementar** em `lib/core/due-digest.ts`.
- [ ] **Step 4:** → PASS.
- [ ] **Step 5: Commit** `feat(core): mensagem diária de prazos`.

---

### Task 4: Cliente da Web API do Slack

**Files:**
- Create: `lib/slack/client.ts`
- Test: `lib/slack/client.test.ts`

**Interfaces:**
- Produces:
  - `class SlackError extends Error { constructor(public code: string, public retryable: boolean) }`
  - `interface SlackClient { postMessage(channel: string, text: string): Promise<void>; lookupUserIdByEmail(email: string): Promise<string | null>; listBotChannels(): Promise<{ id: string; name: string }[]> }`
  - `createSlackClient(token: string, fetchImpl: typeof fetch = fetch): SlackClient`

Comportamento:
- `POST https://slack.com/api/{method}`, `Authorization: Bearer {token}`, `signal: AbortSignal.timeout(10_000)`.
- `postMessage` (`chat.postMessage`) envia JSON (`Content-Type: application/json; charset=utf-8`): `{ channel, text, unfurl_links: false, unfurl_media: false }`.
- Os métodos de leitura enviam `application/x-www-form-urlencoded` (o Slack não aceita JSON neles).
- `lookupUserIdByEmail`: `users.lookupByEmail` com `email=`; `ok:false` com `users_not_found` → `null`; devolve `user.id`.
- `listBotChannels`: `users.conversations` com `types=public_channel,private_channel`, `exclude_archived=true`, `limit=200`, seguindo `response_metadata.next_cursor` até vazio; ordenado por nome.
- Classificação de erro (lança `SlackError`):
  - `fetch` rejeita com `cause.code` em `ENOTFOUND | EAI_AGAIN | ECONNREFUSED | UND_ERR_CONNECT_TIMEOUT` → `retryable: true`, `code` = esse código.
  - `fetch` rejeita por qualquer outro motivo (inclui `TimeoutError`/`AbortError`, `ECONNRESET`) → `retryable: false`, `code: 'ambiguous'`.
  - HTTP 429 ou 5xx → `retryable: true`, `code: 'http_{status}'`.
  - `ok:false` → `code` = `error` do Slack; `retryable` só se `error === 'ratelimited'`.

- [ ] **Step 1: Testes que falham** (fetch falso, no estilo de `lib/email/mailer.test.ts`):
  - `postMessage monta o POST`: URL, header `Authorization`, corpo com `channel`, `text`, `unfurl_links: false`.
  - `ok:false vira SlackError não retentável` (`not_in_channel`).
  - `ratelimited e HTTP 503 são retentáveis`.
  - `conexão recusada é retentável; timeout é ambíguo`: rejeitar com `Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNREFUSED' } })` → retryable; rejeitar com `new DOMException('x', 'TimeoutError')` → `code: 'ambiguous'`, não retentável.
  - `lookupUserIdByEmail devolve null para users_not_found`.
  - `listBotChannels segue o cursor`: duas páginas → lista concatenada e ordenada.
- [ ] **Step 2:** → FAIL. **Step 3:** implementar. **Step 4:** → PASS.
- [ ] **Step 5: Commit** `feat(slack): cliente da Web API`.

---

### Task 5: Runner do tick

**Files:**
- Create: `lib/slack/digest-runner.ts`
- Test: `lib/slack/digest-runner.test.ts`

**Interfaces:**
- Consumes: Tasks 1–4.
- Produces: `runDigestTick(db: Db, now: Date, deps: { slack: SlackClient; boardUrl: (projectId: string) => string; log?: (msg: string) => void }): Promise<{ sent: number; empty: number; failed: number; retry: number }>`

Fluxo:
1. `{ date, hour } = saoPauloClock(now)`. Se `!isBusinessDay(date)` ou `hour < 9` ou `hour >= 12` → devolve zeros sem tocar no banco.
2. `failStaleSending(db, date, now)`; se > 0, logar `[slack] envio interrompido em N projeto(s)`.
3. Cache `Map<email, string | null>` local ao tick.
4. Para cada `listDigestTargets`: `if (!claimDelivery(...)) continue`. Dentro de `try`: `listDueCards` → `buildDigest(cards, date, isFirstBusinessDayOfWeek(date))` → se vazio `finishDelivery('empty')`; senão resolve e-mails únicos (erro na busca → `null`, logar), `renderDigest`, `slack.postMessage(channelId, text)`, `finishDelivery('sent')`. `catch`: `SlackError` → `finishDelivery(e.retryable ? 'retry' : 'failed', e.code)`; outro erro → `failed` com `e.message`. Sempre logar `[slack] {projeto}: {status}{ (code)}`. Um projeto não interrompe os outros.

- [ ] **Step 1: Testes que falham** (`makeTestDb`; SlackClient falso que grava chamadas; datas em UTC, SP = UTC−3):
  - `fora de dia útil ou da janela não faz nada`: `2026-11-14T13:00Z` (sábado), `2026-11-20T13:00Z` (feriado), `2026-11-16T11:59Z` (8h59), `2026-11-16T15:00Z` (12h00) → nenhuma chamada, nenhuma linha.
  - `janela 9h–12h`: `2026-11-16T12:00Z` e `2026-11-16T14:59Z` enviam.
  - `envia uma vez por projeto com canal`: dois projetos com canal (um com tarefas atrasadas, outro sem nada) e um sem canal → 1 `postMessage`, status `sent` e `empty`; projeto sem canal sem linha.
  - `não repete após reinício`: dois ticks seguidos em 16/11 → 1 `postMessage`.
  - `segunda inclui a semana, terça não; segunda feriado passa para o primeiro dia útil`: card vencendo no domingo da semana aparece em 16/11 e não em 17/11; em `2026-11-03T12:30Z` (terça após Finados) aparece.
  - `erro retentável tenta no próximo tick`: falso lança `SlackError('ratelimited', true)` uma vez → `retry`; próximo tick → `sent`, `attempts = 2`.
  - `erro permanente encerra o dia`: `SlackError('not_in_channel', false)` → `failed`; próximo tick não chama `postMessage`.
  - `sending antigo vira failed`: inserir à mão linha `sending` do dia → tick → `failed`/`interrupted`, nenhum `postMessage`.
  - `busca de e-mail que falha vira nome`: `lookupUserIdByEmail` rejeita para um e-mail → mensagem enviada contendo o nome da pessoa sem `<@`.
  - `projeto arquivado não recebe`.
- [ ] **Step 2:** → FAIL. **Step 3:** implementar. **Step 4:** → PASS.
- [ ] **Step 5: Commit** `feat(slack): tick diário de prazos`.

---

### Task 6: Agendador, inicialização e documentação de deploy

**Files:**
- Create: `lib/slack-scheduler.ts`
- Modify: `instrumentation.ts`, `docs/deploy.md`, `PRODUCT.md`
- Test: `lib/slack-scheduler.test.ts`

**Interfaces:**
- Consumes: `runDigestTick` (Task 5), `createSlackClient` (Task 4), `appUrl` (`lib/email/mailer.ts`), `getDb`.
- Produces: `startSlackScheduler(): void` — retorna sem fazer nada se `process.env.NODE_ENV !== 'production'` ou `SLACK_BOT_TOKEN` vazio. Senão: tick agora e a cada 15 min (`.unref()`), com guarda `running` que pula o tick se o anterior não terminou. `boardUrl = (id) => appUrl(\`/project/${id}\`)`. Erros viram `console.error('[slack] falhou: …')`.

- [ ] **Step 1: Testes que falham** (mesmo estilo de `lib/sprint-scheduler.test.ts`, mockando `@/lib/db/client` e `./slack/digest-runner`):
  - `não inicia fora de produção ou sem token` (`vi.stubEnv`).
  - `roda já e a cada 15 minutos`.
  - `não sobrepõe ticks`: runner que só resolve depois de 20 min → no minuto 15 continua com 1 chamada.
  - `registra o erro com [slack] e não derruba o processo`.
- [ ] **Step 2:** → FAIL. **Step 3:** implementar e chamar `startSlackScheduler()` em `instrumentation.ts` logo após `startSprintScheduler()` (import dinâmico, como os outros). **Step 4:** → PASS.
- [ ] **Step 5: Documentação.**
  - `docs/deploy.md`: na tabela de variáveis, `SLACK_BOT_TOKEN` (só na VPS; sem ele o bot fica desligado; não usar com `NODE_ENV=production` fora da VPS, porque uma cópia do banco mandaria de novo nos canais reais). Nova seção "Bot do Slack": criar o app em api.slack.com/apps "From a manifest" com o manifesto abaixo, instalar no workspace, copiar o *Bot User OAuth Token* para `SLACK_BOT_TOKEN`, deploy, `/invite @martrello` em cada canal, escolher o canal no `/admin`.

    ```yaml
    display_information:
      name: martrello
      description: Avisa no canal do projeto as tarefas atrasadas e que vencem.
    features:
      bot_user:
        display_name: martrello
        always_online: false
    oauth_config:
      scopes:
        bot: [chat:write, users:read, users:read.email, channels:read, groups:read]
    settings:
      org_deploy_enabled: false
      socket_mode_enabled: false
    ```
  - `PRODUCT.md` linha 29: tirar "(projeto seguinte)" e dizer que o bot usa o e-mail para marcar a pessoa. Na linha 21, deixar claro que os avisos de prazo vão pelo Slack, fora do produto.
- [ ] **Step 6:** `pnpm test` → PASS.
- [ ] **Step 7: Commit** `feat(slack): agendador e instruções de deploy`.

---

### Task 7: Canal e status no `/admin`

**Files:**
- Create: `app/(app)/admin/slack-channel.ts` (funções puras), `app/(app)/admin/SlackChannelPicker.tsx`
- Modify: `app/(app)/admin/page.tsx`, `app/(app)/admin/ProjectMembersSection.tsx`, `app/(app)/admin/actions.ts`
- Test: `app/(app)/admin/slack-channel.test.ts`

**Interfaces:**
- Consumes: `setProjectSlackChannel`, `deliveryStatuses`, `ProjectDeliveryStatus` (Task 2); `createSlackClient` (Task 4).
- Produces:
  - `type SlackSetup = { state: 'off' } | { state: 'error'; message: string } | { state: 'ok'; channels: { id: string; name: string }[] }`
  - `channelOptions(saved: { id: string; name: string } | null, channels: { id: string; name: string }[]): { id: string; label: string; unavailable: boolean }[]` — canais do bot com rótulo `#nome`; se `saved` não estiver na lista, ele vem primeiro com rótulo `#nome (indisponível)` e `unavailable: true`.
  - `formatDeliveryStatus(s: ProjectDeliveryStatus | undefined, now: Date): string` — horários em São Paulo, formato `dd/mm HHhMM`:
    - sem registro → `Nenhum envio ainda`
    - latest `sent` → `Enviado em 16/11 9h03`
    - latest `empty` → `16/11 9h03: nada a avisar` + (se houver) ` · último envio 13/11 9h02`
    - latest `retry` → `Erro em 16/11 9h03: {motivo} (tenta de novo até 12h)`
    - latest `failed` → `Erro em 16/11 9h03: {motivo}` + (se houver) ` · último envio 13/11 9h02`
    - `{motivo}`: `not_in_channel` → `o bot não está no canal`; `channel_not_found` → `canal não encontrado`; `invalid_auth` / `account_inactive` → `token do Slack inválido`; `interrupted` → `envio interrompido`; `ambiguous` → `sem confirmação do Slack`; outro → o código cru.
  - `setSlackChannelAction(projectId: string, channel: { id: string; name: string } | null): Promise<ActionResult>` em `actions.ts`, usando o `run()` existente.

- [ ] **Step 1: Testes que falham** (`slack-channel.test.ts`):
  - `channelOptions marca indisponível`: salvo `C9/antigo` fora da lista → primeiro item `#antigo (indisponível)`.
  - `channelOptions sem salvo` → só os canais do bot.
  - `formatDeliveryStatus` cobre cada linha da lista acima, com horários em SP (ex.: `Date.parse('2026-11-16T12:03:00Z')` → `9h03`).
- [ ] **Step 2:** → FAIL. **Step 3:** implementar `slack-channel.ts` → **Step 4:** PASS.
- [ ] **Step 5: UI.**
  - `page.tsx`: se `SLACK_BOT_TOKEN` vazio → `{ state: 'off' }`; senão `createSlackClient(token).listBotChannels()` em `try/catch` → `ok` ou `error` (a página abre do mesmo jeito). Carregar `deliveryStatuses(db)` e passar para cada projeto `slack: { saved, status: formatDeliveryStatus(...) }`. `listProjects` já devolve `slackChannelId`/`slackChannelName` (faz `select()` de todas as colunas).
  - `ProjectMembersSection`: nova faixa no rodapé de cada card de projeto, renderizando `<SlackChannelPicker>`.
  - `SlackChannelPicker` (client): `off` → texto `Slack não configurado`; `error` → `Não foi possível listar os canais do Slack: {message}` e o canal salvo, se houver; `ok` → `<select class="field">` com `Nenhum` + `channelOptions`, `aria-label="Canal do Slack"`, chamando `setSlackChannelAction` (com `null` para Nenhum); abaixo, a dica `Não achou o canal? Convide o bot com /invite @martrello` e a linha de status.
- [ ] **Step 6: Verificação manual** com `pnpm dev`: sem token, a faixa mostra "Slack não configurado" e a página abre; com um token inválido em `.env.local`, mostra o erro e a página abre. Usar a skill `run` se precisar subir o app.
- [ ] **Step 7:** `pnpm test` e `pnpm build` → PASS.
- [ ] **Step 8: Commit** `feat(admin): canal do Slack e status de envio por projeto`.

---

## Depois do merge (Marcelo)

1. Criar o app pelo manifesto (`docs/deploy.md`), pôr `SLACK_BOT_TOKEN` no Easypanel e fazer o deploy.
2. Convidar o bot nos canais e escolher o canal de cada projeto no `/admin`.
3. No próximo dia útil, conferir o status no `/admin` depois das 9h15.
