# Project name privacy: acronyms + reveal toggle + green palette — design spec

**Data:** 2026-10-01
**Status:** aprovado para implementação
**Autor:** Marcelo + Claude (brainstorming)
**Branch:** `feat/project-acronyms`

---

## 1. Objetivo

Hoje o nome real de cada projeto (geralmente o nome de um cliente) aparece em
3 lugares da UI. Isso é um problema quando o usuário tira print ou foto da
tela — o nome do cliente fica exposto. O objetivo é mascarar o nome por
padrão (mostrando só um acrônimo de 3 letras), com um botão para revelar o
nome real quando precisar, e trocar a cor padrão dos projetos (hoje um cinza
único e idêntico em todos) por uma paleta de verde-oliva (Sálvia).

## 2. Escopo

### Inclui

- Coluna `acronym` em `projects` (única, igual ao `name` hoje), auto-sugerida
  na criação, sempre editável.
- Algoritmo de sugestão de acrônimo (seção 4).
- Backfill dos 7 projetos existentes (Motim, Villela, Nubank, Edu-TO, Aulas
  DascIA, Aulas Walter, Axivero) e do arquivado Aulas Mayk.
- Paleta de 7 verdes "Sálvia" como nova paleta padrão de cor de projeto,
  substituindo o cinza único atual (`DEFAULT_COLOR = '#64748b'`).
- Um toggle global (React Context, só em memória) que alterna entre mostrar
  acrônimo e mostrar nome real, nos 3 lugares onde o nome aparece hoje:
  - Lista de projetos na sidebar (`components/SidebarClient.tsx`)
  - Cabeçalho da página do board (`app/project/[id]/page.tsx`)
  - Pill de projeto nos cards da sprint (`components/Card.tsx`, variant sprint)
- Validação de unicidade do acrônimo (mesmo padrão de `NAME_CONFLICT` que já
  existe para `name`).

### Não inclui

- Mascarar o nome do projeto nas respostas do MCP para o Claude (chat não é
  print de tela — o Claude continua vendo/usando o nome real sempre).
- Persistir a preferência de revelar entre reloads (decisão explícita: ao
  recarregar, sempre volta escondido).
- Mudar o `<title>` da aba do navegador (já é estático, "martrello", não
  vaza nome de projeto).
- Qualquer busca de identidade visual real da Axivero Consultores — pesquisei
  e não encontrei presença pública; a paleta é uma escolha própria do
  usuário (Sálvia), não uma cópia de marca existente.

## 3. Modelo de dados

```ts
// lib/db/schema.ts — projects table
acronym: text('acronym').notNull().unique(),
```

Migração via `pnpm db:generate` adiciona a coluna como `NOT NULL DEFAULT ''`
(exigência do SQLite para `ALTER TABLE ADD COLUMN NOT NULL` em tabela com
linhas existentes). Um script de backfill, rodado uma vez
(`scripts/backfill-acronyms.ts`, padrão idêntico a `scripts/seed.ts`),
substitui a string vazia em cada projeto existente pelo acrônimo calculado
pela função da seção 4. Depois do backfill, `''` nunca mais aparece — toda
criação de projeto daqui pra frente sempre fornece um acrônimo (auto-sugerido
ou explícito).

`createProject`/`updateProject` em `lib/core/projects.ts` passam a aceitar
`acronym?: string`; se omitido na criação, chamam a função de sugestão.
Conflito de acrônimo (duplicado) lança `MartrelloError('NAME_CONFLICT', ...)`
— mesmo código de erro já usado para nome duplicado, mensagem distinta.

## 4. Algoritmo de sugestão de acrônimo

Função pura em `lib/core/acronym.ts`, `suggestAcronym(name: string): string`.

**Passo 1 — tentar separar em palavras.** Divide `name` em "palavras" por
espaço, hífen, underscore, OU transição minúscula→maiúscula (camelCase).

- **3+ palavras encontradas:** primeira letra de cada uma das 3 primeiras.
  Ex: "Never Say never" → N, S, n → `NSN`.
- **Exatamente 2 palavras:** primeira letra de cada uma + a última letra do
  nome inteiro (sem separadores), maiúsculas. Ex: "Edu-TO" → E, T + último
  caractere de "EduTO" (`O`) → `ETO`. "TotalPass" → T, P + último caractere
  de "TotalPass" (`s`) → `TPS`.
- **1 palavra só (nenhum separador, sem camelCase):** amostra a 1ª, a letra
  do meio (`floor((len-1)/2)`) e a última letra do nome, maiúsculas. Ex:
  "Nubank" (N,u,b,a,n,k) → idx0=N, idx2=b, idx5=k → `NBK`. "Berzerk" → `BZK`.

Todos os exemplos dados pelo usuário batem com essa regra (`NBK`, `BZK`,
`ETO`, `TPS`, `NSN`). A sugestão é sempre um ponto de partida — o usuário
pode editar livremente, inclusive pra resolver colisão de unicidade.

**Acrônimos calculados pro backfill:**

| Projeto | Acrônimo |
|---|---|
| Motim | MTM |
| Villela | VLA |
| Nubank | NBK |
| Edu-TO | ETO |
| Aulas DascIA | ADA |
| Aulas Walter | AWR |
| Aulas Mayk (arquivado) | AMK |
| Axivero | AVO |

## 5. Paleta de cor — Sálvia

Substitui `DEFAULT_COLOR = '#64748b'` em `lib/core/projects.ts` por uma
paleta de 7 tons, ciclando por posição de criação (mesmo índice usado hoje
pra `position`):

```ts
export const PROJECT_COLOR_PALETTE = [
  '#8a9a5b', '#6b8e4e', '#a3b18a', '#588157',
  '#3a5a40', '#344e41', '#9db380',
] as const;
```

`createProject` usa `PROJECT_COLOR_PALETTE[index % 7]` quando `color` não é
passado explicitamente (index = posição do projeto na lista, não precisa de
query extra — já é calculado a partir do `maxPos` existente). O backfill
script também recolore os 7 projetos existentes (hoje todos no mesmo cinza)
seguindo a mesma lógica, na ordem atual de `position`.

## 6. Mecanismo de revelar/esconder

**Estado:** React Context (`ProjectPrivacyContext`), provido em
`app/layout.tsx` por um novo client component `ProjectPrivacyProvider`.
Estado `revealed: boolean`, inicial `false`, só em memória — nenhuma escrita
em localStorage, cookie ou banco. Um reload (F5, nova aba) sempre volta a
`false`. Expõe `{ revealed, toggle }` via hook `useProjectPrivacy()`.

**Toggle:** botão de olho no topo da sidebar (`SidebarClient.tsx`, próximo ao
cabeçalho "martrello"). Usa o hook, chama `toggle()`.

**Consumo (3 lugares, todos client components hoje ou que passam a ser):**

- `SidebarClient.tsx`: já é client — lê `revealed` do hook, mostra
  `p.name` ou `p.acronym` por linha de projeto.
- `app/project/[id]/page.tsx`: hoje renderiza `project.name` direto num
  Server Component. Extraído um pequeno client component
  `components/ProjectHeaderName.tsx` que recebe `{ name, acronym }` e decide
  o que mostrar via o hook — only essa parte vira client, o resto da página
  continua Server Component.
- `components/Card.tsx`: já é client — a pill de projeto (`card.projectName`)
  passa a mostrar `card.projectAcronym` quando `!revealed`, nome real quando
  `revealed`. `CardData` ganha `projectAcronym?: string` (paralelo a
  `projectName`/`projectColor` que já existem), populado em
  `lib/core/sprint.ts`'s `loadSprintCards` a partir de `project.acronym`.

## 7. Testes

- `lib/core/acronym.test.ts`: cobre os 3 ramos do algoritmo com os exemplos
  do usuário (1 palavra, 2 palavras, 3+ palavras) e casos de borda (nome com
  1-2 caracteres).
- `lib/core/projects.test.ts`: `createProject` auto-sugere acrônimo quando
  omitido; rejeita acrônimo duplicado; `updateProject` aceita trocar
  acrônimo.
- Sem teste automatizado pro toggle de UI (este repo não tem setup de teste
  `.tsx` — convenção já estabelecida nas specs anteriores) — verificação
  manual no navegador faz parte do plano de implementação.

## 8. Fora de escopo / não decidido agora

- Se o usuário quiser no futuro mascarar título de card ou descrição
  também, é uma extensão separada — fora do pedido atual (só nome de
  projeto).
