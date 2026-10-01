# Dependências entre cards — design spec

**Data:** 2026-09-17
**Status:** aprovado para implementação
**Autor:** Marcelo + Claude (brainstorming)
**Branch:** `feat/card-dependencies`

---

## 1. Objetivo

Permitir marcar que um card depende de (é bloqueado por) um ou mais cards do
mesmo projeto, e sinalizar isso visualmente no board e na sprint — sem exigir
nenhuma ação manual pra "desbloquear": o bloqueio some sozinho quando os
pré-requisitos forem concluídos.

## 2. Escopo

### Inclui

- Nova tabela `card_dependencies` (N:N, mesmo projeto, sem ciclos).
- Cálculo de "bloqueado" on-the-fly em `lib/core` (Abordagem A — sem cache,
  sem flags derivadas persistidas). Ver seção 5 para o porquê.
- Indicador visual no `Card.tsx`: borda âmbar + ícone de cadeado + leve
  opacidade, tanto no board quanto na sprint.
- Seção "Depende de" no `CardPanel`: lista os bloqueadores atuais (com botão
  de remover) e um seletor pra adicionar outro card do mesmo projeto.
- Tools MCP: `martrello_add_dependency`, `martrello_remove_dependency`.
- `martrello_get_card` e `martrello_get_project` passam a incluir a lista de
  dependências de cada card e o `isBlocked` calculado.

### Não inclui

- Dependências entre projetos diferentes.
- Múltiplos critérios de "concluído" configuráveis — fixo em "está na última
  lista do projeto (por position) OU está arquivado".
- Notificação/alerta quando um card é desbloqueado (fica só o efeito visual).
- Mudança em regras de drag-and-drop: um card bloqueado continua podendo ser
  movido livremente entre listas — o bloqueio é só sinalização, não trava
  interação. (Se isso for indesejado, é decisão pra iterar depois.)

## 3. Modelo de dados

```ts
// lib/db/schema.ts
export const cardDependencies = sqliteTable(
  'card_dependencies',
  {
    blockedCardId: text('blocked_card_id').notNull().references(() => cards.id, { onDelete: 'cascade' }),
    blockerCardId: text('blocker_card_id').notNull().references(() => cards.id, { onDelete: 'cascade' }),
    createdAt: integer('created_at').notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.blockedCardId, t.blockerCardId] }),
    byBlocked: index('deps_by_blocked').on(t.blockedCardId),
    byBlocker: index('deps_by_blocker').on(t.blockerCardId),
  }),
);
```

Regras aplicadas em `lib/core/dependencies.ts` (não no schema — SQLite não
tem CHECK entre tabelas):

- **Mesmo projeto**: ao criar, valida `blocked.projectId === blocker.projectId`.
  Erro estruturado (`lib/errors.ts`) se violar.
- **Sem auto-dependência**: `blockedCardId !== blockerCardId`.
- **Sem ciclos**: antes de inserir a aresta `blocked -> blocker`, faz um BFS a
  partir de `blocker` seguindo arestas `blocker -> seus bloqueadores`; se
  `blocked` for alcançável, rejeita (criaria um ciclo). Grafo é por projeto e
  pequeno (dezenas de cards), custo irrelevante.
- **Idempotente**: inserir uma dependência já existente não duplica (é a PK
  composta) — mesmo padrão de `add_to_sprint`.

## 4. Lógica de bloqueio (`lib/core/dependencies.ts`)

```ts
function isCardBlocked(cardId, allDeps, allCards, allLists): boolean {
  const blockers = allDeps.filter(d => d.blockedCardId === cardId);
  return blockers.some(dep => {
    const blocker = allCards[dep.blockerCardId];
    if (blocker.archivedAt) return false; // arquivado conta como concluído
    const lastListPosition = max(position das listas do projeto do blocker);
    return blocker.listPosition !== lastListPosition; // ainda não é a última lista
  });
}
```

Calculado sempre que os cards são montados pra leitura — no board
(`getProject`), na sprint (`getSprint`) e no card avulso (`getCard`). Nenhuma
coluna nova em `cards`, nenhum hook de sincronização. Se o volume de cards
crescer a ponto de isso pesar, é um problema pra resolver quando aparecer
(YAGNI), não agora.

## 5. Por que Abordagem A (sem cache)

Considerei cachear um `isBlocked` na própria linha do card, recalculado via
hook quando qualquer card muda de lista. Descartado: mover um card pode
desbloquear vários outros simultaneamente (todo mundo que dependia dele), o
que exigiria recalcular em cascata toda vez que qualquer card se move — muita
complexidade pra um app pessoal com poucas dezenas de cards por projeto. O
cálculo on-the-fly é O(cards do projeto), trivial nesse volume, e elimina
qualquer classe de bug de "cache dessincronizado".

## 6. UI — `components/Card.tsx`

- `CardData` ganha `isBlocked: boolean`.
- Quando `isBlocked`:
  - `borderLeftColor` fixo em `var(--color-mt-warning)` (nova variável;
    checar se já existe um tom âmbar no design system antes de adicionar —
    se não existir, usar `#f59e0b` seguindo a paleta petrol/purple já em
    uso), **sobrescrevendo** a cor da label.
  - Ícone de cadeado (SVG inline, mesmo padrão do `CalendarIcon`) antes do
    título.
  - Fundo com opacidade reduzida (`opacity-70` ou equivalente), removida no
    hover pra manter legibilidade ao interagir.
- Sem mudança de comportamento — clicável, arrastável, normalmente.

## 7. UI — `components/CardPanel.tsx`

Nova seção "Depende de", abaixo de labels/deadline:

- Lista os cards bloqueadores atuais: título + indicador se já está
  concluído (não bloqueia mais) ou pendente. Cada um com botão "remover"
  (chama a Server Action que deleta a dependência).
- Seletor (mesmo padrão dos outros pickers do painel) pra escolher outro
  card do mesmo projeto como novo pré-requisito. Exclui: o próprio card, os
  já vinculados, e os que criariam ciclo (mesma validação do core, reaplicada
  aqui só pra desabilitar a opção na UI — a fonte da verdade é sempre o
  `lib/core`).

## 8. MCP tools

```ts
martrello_add_dependency({ card_id, blocker_card_id })
// -> valida mesmo projeto + sem ciclo, insere, retorna a aresta criada

martrello_remove_dependency({ card_id, blocker_card_id })
// -> idempotente, remove se existir
```

`martrello_get_card` e `martrello_get_project` (nos cards retornados) passam
a incluir:

```ts
{
  ...card,
  isBlocked: boolean,
  dependsOn: Array<{ id, title, isDone: boolean }>,
}
```

## 9. Realtime

Nenhuma mudança necessária em `app/api/stream/route.ts` — o mecanismo atual
observa o arquivo WAL do SQLite, então uma escrita em `card_dependencies`
(de qualquer processo, UI ou MCP) já dispara o refresh normalmente.

## 10. Testes

- `lib/core/dependencies.ts`: criar, remover, idempotência, rejeição de
  cross-project, rejeição de auto-dependência, rejeição de ciclo (direto e
  transitivo), `isCardBlocked` nos casos: sem bloqueador, bloqueador pendente,
  bloqueador em Feito, bloqueador arquivado, múltiplos bloqueadores (um
  pendente é suficiente pra bloquear).
- `components/Card.tsx`: snapshot/render com `isBlocked: true` (cadeado +
  borda) vs `false` (comportamento atual inalterado).

## 11. Fora de escopo / não decidido agora

- O que acontece com dependências quando um card é arquivado ou deletado do
  board (schema já cobre via `onDelete: cascade`; comportamento de negócio —
  ex: avisar que havia dependentes — fica pra depois se vier a incomodar).
