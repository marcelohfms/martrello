# Realtime board updates via SSE — design spec

**Data:** 2026-05-28
**Status:** aprovado para implementação
**Autor:** Marcelo + Claude (brainstorming)
**Branch:** `feat/realtime-sse`

---

## 1. Objetivo

Fazer o board e o sprint atualizarem em tempo quase-real (~100-300ms) quando o banco muda, **independente da origem da escrita** (UI ou MCP), eliminando a sensação de "precisa recarregar". Substitui o polling de 3s atual (`useAutoRefresh`) por push via Server-Sent Events (SSE).

## 2. Insight central

O app roda em SQLite com `journal_mode = WAL` (definido em `lib/db/client.ts`). **Toda transação de escrita modifica o arquivo `martrello.db-wal`**, não importa qual processo a fez — o web app (Server Actions) ou o servidor MCP (processo separado que o Claude Code spawna).

Logo, em vez de instrumentar cada mutação (a abordagem `mcp/notify.ts` esboçada no spec v1), basta o endpoint SSE **observar o arquivo WAL**. Detecção de mudança com zero instrumentação no domínio.

## 3. Escopo

### Inclui

- `app/api/stream/route.ts` — endpoint SSE que observa o DB e empurra eventos `changed`.
- `components/useRealtimeRefresh.ts` — hook client que consome o SSE e chama `router.refresh()`.
- Helper de debounce testável.
- Troca de `useAutoRefresh(3000)` por `useRealtimeRefresh()` em `BoardClient` e `SprintClient`.

### Não inclui

- Mudança em `lib/core/*`, `mcp/*`, `app/actions.ts`, schema. Zero instrumentação.
- Scoping de payload (qual projeto/sprint mudou). Payload é um sinal burro `changed`.
- CardPanel — mantém o SWR próprio (`refreshInterval: 3000` + `revalidateOnFocus`).
- Suporte serverless/Vercel (ver Limitações).
- Remover `useAutoRefresh.ts` do repo — fica como fallback referenciável; será removido só se nada mais usar (verificar no plano).

## 4. Arquitetura

### 4.1 Endpoint SSE — `app/api/stream/route.ts`

Route Handler (Node.js runtime, **não** edge — precisa de `fs`) que retorna um `Response` com um `ReadableStream`:

```
GET /api/stream
→ Content-Type: text/event-stream
→ corpo: stream que emite "data: changed\n\n" a cada mudança no DB
```

Comportamento:

1. Ao conectar, resolve o diretório do DB (`path.dirname(DB_PATH)` onde `DB_PATH` vem da mesma lógica de `lib/db/client.ts` — `process.env.DATABASE_URL?.replace(/^file:/, '') ?? './martrello.db'`).
2. `fs.watch(dbDir, ...)` no **diretório** (não no arquivo — o WAL pode não existir ainda no primeiro boot; observar o diretório pega criação também). Filtra eventos cujo `filename` começa com o basename do DB (`martrello.db`).
3. Cada evento passa por um **debounce de ~120ms** (WAL muda em rajadas dentro de uma transação) → emite um único `changed`.
4. Envia um comentário keep-alive (`: ping\n\n`) a cada ~25s para evitar que proxies/derrubem a conexão ociosa.
5. No `request.signal` abortar (cliente desconectou), fecha o `fs.watch` e o stream. Sem leaks.

Runtime: declara `export const runtime = 'nodejs'` e `export const dynamic = 'force-dynamic'` (nunca cachear).

### 4.2 Hook client — `components/useRealtimeRefresh.ts`

```ts
'use client';
export function useRealtimeRefresh(opts?: { fallbackMs?: number }): void;
```

Comportamento:

1. Abre `new EventSource('/api/stream')`.
2. `onmessage` → `router.refresh()`.
3. **Fallback de polling lento** (`fallbackMs`, default 20000): um `setInterval` que chama `router.refresh()` a cada 20s, garantindo atualização mesmo se o SSE cair e não reconectar.
4. **Revalida no foco**: `window.addEventListener('focus', () => router.refresh())` — mantém o bom comportamento atual.
5. `EventSource` reconecta sozinho em queda; só precisamos do cleanup (`es.close()`, `clearInterval`, `removeEventListener`) no unmount.
6. Suspende nada explicitamente — o custo de um refresh em aba oculta é baixo; manter simples. (Se virar problema, suspende via `visibilitychange` depois.)

### 4.3 Debounce helper — `lib/realtime/debounce.ts`

Função pura, testável:

```ts
export function debounce<A extends unknown[]>(
  fn: (...args: A) => void,
  ms: number,
): ((...args: A) => void) & { cancel: () => void };
```

Coalesce chamadas dentro da janela `ms`; expõe `cancel()` para cleanup do watcher.

### 4.4 Integração

- `app/project/[id]/BoardClient.tsx`: `useAutoRefresh(3000)` → `useRealtimeRefresh()`.
- `app/sprint/SprintClient.tsx`: idem.

## 5. Fluxo de dados

```
Claude (MCP) ──escreve──┐
                        ├──> martrello.db-wal (mtime muda)
UI (Server Action) ─────┘            │
                                     │ fs.watch (diretório, filtra martrello.db*)
                                     ▼
                          app/api/stream  ──debounce 120ms──> "data: changed"
                                     │ (SSE)
                                     ▼
                      EventSource no browser ──> router.refresh()
                                     │
                                     ▼
                       Server Component re-renderiza com dados novos
```

## 6. Tratamento de erros / edge cases

- **WAL não existe no boot**: observar o diretório resolve (pega a criação do arquivo). Se o diretório não existir (DB nunca migrado), `fs.watch` lança — capturar e responder 500 com mensagem clara; na prática o DB sempre existe (migrado no setup).
- **`filename` null no evento `fs.watch`**: em algumas plataformas/casos o callback não traz o nome do arquivo. Tratamento: se `filename` for null, considerar o evento relevante (dispara `changed`) em vez de descartar — falso-positivo ocasional é inofensivo (um refresh a mais), falso-negativo perderia uma atualização. macOS (alvo) costuma trazer o filename via FSEvents, então o filtro normalmente funciona.
- **Cliente desconecta**: `request.signal` aborta → cleanup do watcher. Testar que não vaza watchers (cada conexão = 1 watcher; fecha junto).
- **Múltiplas abas**: cada uma abre seu próprio `EventSource` + watcher no servidor. N abas = N watchers. Aceitável pra uso pessoal (≤ poucas abas). Não otimizar com um watcher compartilhado agora (YAGNI; exigiria singleton de processo + fan-out).
- **Rajada de escritas** (ex.: `close_sprint` que faz várias mutações numa transação): debounce coalesce em 1 refresh.
- **SSE cai silenciosamente**: o fallback de 20s cobre. `EventSource` também tenta reconectar nativamente.
- **`router.refresh()` concorrente**: chamadas sobrepostas são idempotentes (Next coalesce); sem estado a corromper.

## 7. Limitações conhecidas

- **Não funciona em serverless (Vercel)**: SSE de longa duração e `fs.watch` dependem de processo persistente + filesystem local. Em Vercel Functions (efêmeras, FS read-only) isso quebra. Quando/se o app for pra nuvem, a detecção de mudança precisará de outro mecanismo (ex.: Postgres `LISTEN/NOTIFY`, Upstash Redis pub/sub, ou polling client). Documentado aqui; **fora de escopo** até a decisão de deploy. O hook degrada graciosamente: se o `EventSource` nunca conectar, o fallback de 20s mantém o app funcional.

## 8. Testes

- **Unit (`lib/realtime/debounce.test.ts`)**: com fake timers — coalesce de múltiplas chamadas em uma, `cancel()` impede a chamada pendente, args da última chamada são usados.
- **Sem teste de componente / SSE / fs.watch** (integração de I/O, consistente com o resto do projeto que não testa React).
- **Smoke manual** (no plano): abrir 2 abas no mesmo board; criar/mover card via MCP numa aba; a outra atualiza em < 1s **sem reload manual**. Repetir no `/sprint`. Confirmar no DevTools → Network que `/api/stream` fica aberto como `eventsource` e recebe eventos.

## 9. Fora de escopo (explícito)

- Scoping de evento por projeto/sprint.
- Otimização de watcher compartilhado entre conexões.
- Suspender refresh em aba oculta.
- Atualização em tempo-real do CardPanel aberto (mantém SWR).
- Qualquer coisa de serverless/cloud.
- Indicador visual de "conectado ao tempo-real" (sininho/dot). Pode vir depois.

## 10. Roadmap (referência)

- Indicador de conexão SSE no header.
- Payload com escopo (`{type: 'card', projectId}`) pra revalidar só o necessário quando o board crescer.
- Mecanismo cloud-friendly quando/se deploiar.
