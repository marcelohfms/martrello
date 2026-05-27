# Deadline date picker — design spec

**Data:** 2026-05-27
**Status:** aprovado para implementação
**Autor:** Marcelo + Claude (brainstorming)
**Branch:** `feat/deadline-date-picker`

---

## 1. Objetivo

Substituir o input de prazo do `CardPanel` (atualmente `<input type="text">` com placeholder pt-BR) por um **date picker visual** com calendário sempre visível e botões de atalho para datas comuns. A UI gera ISO `YYYY-MM-DD` direto — sem dependência do parser pt-BR em tempo de digitação (o parser continua em uso pelo MCP quando o Claude recebe "prazo sex" via linguagem natural).

## 2. Escopo

### Inclui

- Novo componente `components/DeadlinePicker.tsx`.
- Dependências novas: `react-day-picker` (~25 KB gz).
- Atualização de `components/CardPanel.tsx` para usar o picker.
- CSS override em `app/globals.css` para tematizar o calendário no dark mode.

### Não inclui

- Mudança no parser pt-BR (`lib/core/dates.ts`) — segue intacto, usado por MCP.
- Mudança no Server Action `updateCardAction` — assinatura igual, recebe ISO.
- Mudança no schema do banco — `cards.due_date` continua `text` com formato `YYYY-MM-DD`.
- Multi-data, intervalo, hora, recorrência. Single date only.
- Time zone handling além do local — o app é local-only, single user.

## 3. Layout e comportamento

### Estrutura visual dentro do `CardPanel`

```
Prazo                                                  ← label (existente)
[ Hoje ] [ Amanhã ] [ Próxima semana ] [ Próximo mês ] ← 4 botões brancos
┌─────────────────────────────┐
│        Maio 2026   ◂  ▸     │
│ dom seg ter qua qui sex sáb │
│              1  2  3  4  5  │
│  6   7  8  9  10 11 12 13   │
│  ...                        │
│             [27]            │  ← hoje (borda); "selected" só após clique
│  ...                        │
└─────────────────────────────┘
[ × Remover prazo ]                                    ← só visível se due_date != null
```

### Botões de atalho

Todos os 4 botões aplicam o mesmo padrão: **clique = navega o calendário + seleciona o dia + persiste imediatamente**. Sem etapa de confirmação separada.

| Botão | Cálculo do dia alvo |
|---|---|
| **Hoje** | `today()` |
| **Amanhã** | `today() + 1 dia` |
| **Próxima semana** | `today() + 7 dias` (preserva o dia da semana) |
| **Próximo mês** | mesmo `day-of-month` no mês seguinte; se o mês alvo não tiver esse dia (ex.: 31 mai → jun), usa o **último dia válido** do mês alvo |

### Calendário

- `react-day-picker` (mode `single`), locale `pt-BR`.
- Estado inicial:
  - Se `card.dueDate` está vazio → exibe mês atual. **Hoje** aparece com estilo destacado de "hoje" (borda do `react-day-picker`), mas nenhum dia está no estado `selected` — o `value` permanece null até o usuário clicar em algo. Abrir o painel **nunca** salva uma data automaticamente.
  - Se `card.dueDate` está preenchido → exibe o mês daquela data, com aquele dia no estado `selected`.
- Click em qualquer célula de dia: salva imediatamente via `updateCardAction(card.id, { dueDate: 'YYYY-MM-DD' })`.
- Navegação de mês via setas nativas do `react-day-picker` ou via os botões de atalho.

### Botão "Remover prazo"

- Sempre presente no DOM, mas visualmente **escondido** quando `card.dueDate` é null (`hidden` Tailwind class condicional). Mantém DOM estável (evita layout shift).
- Click: chama `updateCardAction(card.id, { dueDate: null })`, calendário volta a ter apenas a pré-seleção visual de hoje (sem dia "salvo").

## 4. Estilização

### Botões de atalho

- `bg-white text-slate-900` (fundo branco, texto escuro).
- `border border-slate-200` discreto.
- `hover:bg-slate-100` leve mudança no hover.
- `text-xs px-2.5 py-1.5 rounded`.
- `font-medium` (peso médio, legível mas não chapado).
- Disposição em flex-row com `gap-1.5 flex-wrap` (cai pra segunda linha se não couber).
- O painel tem 420px de largura — os 4 botões com nomes curtos devem caber numa linha só.

### Calendário (CSS override)

`react-day-picker` expõe data-attributes; vamos sobrescrever em `app/globals.css`:

```css
@layer components {
  .rdp-root {
    --rdp-accent-color: var(--color-mt-accent);
    --rdp-background-color: var(--color-mt-card);
    color: var(--color-mt-text);
  }
  .rdp-day_button:hover:not([data-disabled]) {
    background: var(--color-mt-line);
  }
  .rdp-day[data-selected="true"] .rdp-day_button {
    background: var(--color-mt-accent);
    color: white;
  }
  .rdp-day[data-today="true"] .rdp-day_button {
    border: 1px solid var(--color-mt-accent);
  }
  .rdp-month_caption,
  .rdp-weekday {
    color: var(--color-mt-muted);
    font-size: 11px;
  }
}
```

(Exatas seletoras podem precisar ajuste com base no markup real da v9 — validar visualmente.)

### Botão "Remover prazo"

- `text-xs text-rose-400 hover:text-rose-300 transition`.
- Sem background — link visual.
- Ícone `×` ASCII simples (sem dep de icon lib).

## 5. Contrato do componente

```ts
// components/DeadlinePicker.tsx
type Props = {
  value: string | null;          // ISO YYYY-MM-DD ou null
  onChange: (next: string | null) => void;  // chamado a cada mudança (incluindo remover)
};

export function DeadlinePicker({ value, onChange }: Props): JSX.Element;
```

- Stateless visualmente (re-renderiza a partir de `value`).
- Internamente usa `useState` para o mês atualmente exibido (controlado), de modo que os botões de atalho consigam navegar a vista.
- Não conhece nada de cards / actions — quem usa decide o que fazer com `onChange`.

### Uso em `CardPanel.tsx`

```tsx
<DeadlinePicker
  value={card.dueDate}
  onChange={(next) => start(async () => {
    await updateCardAction(card.id, { dueDate: next });
    mutate();
  })}
/>
```

## 6. Lógica de domínio (helpers)

Helpers puros, testáveis em isolamento, vão em `lib/core/date-shortcuts.ts`:

```ts
export function todayISO(now?: Date): string;
export function tomorrowISO(now?: Date): string;
export function nextWeekISO(now?: Date): string;       // +7 dias
export function nextMonthISO(now?: Date): string;      // mesmo dia, clamp pro último dia do mês alvo
```

Todos retornam `YYYY-MM-DD`. Aceitam `now` opcional para testabilidade.

**`nextMonthISO` — regra de clamp:**

```
nextMonthISO(2026-05-31) → 2026-06-30  (jun não tem 31)
nextMonthISO(2026-01-31) → 2026-02-28  (fev tem 28 em 2026)
nextMonthISO(2026-01-30) → 2026-02-28  (fev clamp pra último dia)
nextMonthISO(2026-01-15) → 2026-02-15  (sem clamp necessário)
```

Implementação via `date-fns`: `setMonth(now, now.getMonth() + 1)` retorna data clamp natural? **Não** — `date-fns` retornaria 1º de março nesse caso. Precisa lógica explícita:

```ts
import { addMonths, lastDayOfMonth, setDate, getDate } from 'date-fns';
function nextMonth(d: Date): Date {
  const target = addMonths(d, 1);
  const lastDay = getDate(lastDayOfMonth(target));
  return setDate(target, Math.min(getDate(d), lastDay));
}
```

## 7. Compatibilidade

- **MCP / parser pt-BR**: `lib/core/dates.ts` (parseDate) continua existindo. Quando o Claude recebe "prazo sex" e chama `martrello_create_card(..., due_date: 'sex')`, o core ainda parseia. UI só produz ISO.
- **Migração de dados**: schema não muda; valores ISO existentes seguem funcionando.
- **Backwards compat**: nenhum endpoint quebra; nenhum teste existente quebra.

## 8. Testes

### Helpers (`lib/core/date-shortcuts.test.ts`)

Vitest com fake timers congelados em `2026-05-27` (quarta-feira). Casos:

- `todayISO()` → `'2026-05-27'`
- `tomorrowISO()` → `'2026-05-28'`
- `nextWeekISO()` → `'2026-06-03'` (mesma quarta)
- `nextMonthISO()` (a partir de `2026-05-27`) → `'2026-06-27'`
- `nextMonthISO()` (a partir de `2026-05-31`) → `'2026-06-30'` (clamp)
- `nextMonthISO()` (a partir de `2026-01-31`) → `'2026-02-28'` (clamp pra fev)
- `nextMonthISO()` (a partir de `2026-03-31`) → `'2026-04-30'` (clamp)

### Componente

Sem teste React/component direto (consistente com o resto do projeto — UI testada manualmente). Validação manual:

1. Abrir card sem prazo → calendário mostra mês atual, hoje destacado, sem "Remover prazo" visível.
2. Click em "Hoje" → calendário não muda (já estava no mês), hoje fica selecionado, "Remover prazo" aparece, persiste no DB.
3. Click em "Amanhã" → seleção move pra amanhã, persiste.
4. Click em "Próxima semana" → seleção move pra mesmo dia da semana semana que vem, calendário avança se necessário.
5. Click em "Próximo mês" → calendário avança um mês, mesmo dia selecionado (ou último dia se clamp).
6. Click em outro dia da grade → persiste.
7. Click em "Remover prazo" → due_date vira null, calendário volta pro estado inicial, "Remover prazo" some.
8. Trocar de card sem fechar painel → picker reinicializa com o `value` novo.

## 9. Fora de escopo (explícito)

- Time zone (single user, local).
- Hora do dia.
- Datas no passado bloqueadas (permitidas — usuário pode querer registrar prazo já passado).
- Múltiplas datas / intervalos.
- Atalho de teclado (T pra Hoje, etc.) — pode vir depois.
- Animação de transição de mês.
- Internacionalização — pt-BR hardcoded.

## 10. Roadmap (referência, não compromisso)

- Atalho de teclado pra cada botão (T/M/W/N).
- Comparação visual "vence em N dias" no painel se o prazo existir.
- Picker de hora se vier necessidade real (nenhum sinal ainda).
