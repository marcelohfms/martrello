# Deadline Date Picker — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the free-text deadline input in `CardPanel` with an always-visible `react-day-picker` calendar plus 4 white shortcut buttons (Hoje, Amanhã, Próxima semana, Próximo mês).

**Architecture:** New isolated component `components/DeadlinePicker.tsx` controlled by parent via `value`/`onChange`. Pure date helpers in `lib/core/date-shortcuts.ts` (TDD). CSS theming via `app/globals.css` overrides on `react-day-picker` data-attributes. `CardPanel` swaps its `<input type="text">` for `<DeadlinePicker>` without touching server actions, schema, or the pt-BR parser used by the MCP path.

**Tech Stack:** `react-day-picker@9.x`, `date-fns` (already installed), Tailwind v4, React 19, Vitest.

**Reference spec:** [docs/superpowers/specs/2026-05-27-deadline-date-picker-design.md](../specs/2026-05-27-deadline-date-picker-design.md)

**Branch:** `feat/deadline-date-picker` (already created from `feat/v1`).

---

## Milestone

End of plan: card panel shows the new picker; clicking any shortcut button or any calendar cell persists the date and re-renders correctly; clicking "Remover prazo" clears it; full test suite stays green.

---

## Task 1: Install `react-day-picker`

**Files:**
- Modify: `package.json`, `pnpm-lock.yaml`

- [ ] **Step 1: Install**

```bash
pnpm add react-day-picker@9
```

If pnpm prompts to approve a postinstall script for this package, skip it (this package doesn't need one; it's pure JS).

- [ ] **Step 2: Verify**

```bash
pnpm ls react-day-picker
```

Expected: prints `react-day-picker@9.x.x` with no "missing" markers.

- [ ] **Step 3: Quick smoke import**

```bash
node -e "import('react-day-picker').then(m => console.log('ok', Object.keys(m).slice(0,5)));"
```

Expected: prints `ok [ 'DayPicker', ... ]` (or similar).

- [ ] **Step 4: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "chore: add react-day-picker"
```

---

## Task 2: Date shortcut helpers (TDD)

**Files:**
- Create: `lib/core/date-shortcuts.ts`, `lib/core/date-shortcuts.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// lib/core/date-shortcuts.test.ts
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { todayISO, tomorrowISO, nextWeekISO, nextMonthISO } from './date-shortcuts';

// Wednesday, 2026-05-27 (matches dates.test.ts)
const FIXED_NOW = new Date('2026-05-27T12:00:00Z').getTime();

beforeAll(() => { vi.useFakeTimers(); vi.setSystemTime(FIXED_NOW); });
afterAll(() => vi.useRealTimers());

describe('date-shortcuts', () => {
  it('todayISO returns today in YYYY-MM-DD', () => {
    expect(todayISO()).toBe('2026-05-27');
  });

  it('tomorrowISO returns tomorrow', () => {
    expect(tomorrowISO()).toBe('2026-05-28');
  });

  it('nextWeekISO returns same weekday next week (+7d)', () => {
    expect(nextWeekISO()).toBe('2026-06-03');
  });

  it('nextMonthISO returns same day-of-month next month', () => {
    expect(nextMonthISO()).toBe('2026-06-27');
  });

  it('nextMonthISO clamps to last valid day (May 31 → Jun 30)', () => {
    const may31 = new Date('2026-05-31T12:00:00Z');
    expect(nextMonthISO(may31)).toBe('2026-06-30');
  });

  it('nextMonthISO clamps to last valid day (Jan 31 → Feb 28 in 2026)', () => {
    const jan31 = new Date('2026-01-31T12:00:00Z');
    expect(nextMonthISO(jan31)).toBe('2026-02-28');
  });

  it('nextMonthISO clamps to last valid day (Mar 31 → Apr 30)', () => {
    const mar31 = new Date('2026-03-31T12:00:00Z');
    expect(nextMonthISO(mar31)).toBe('2026-04-30');
  });

  it('nextMonthISO does not clamp when day exists in target month', () => {
    const jan15 = new Date('2026-01-15T12:00:00Z');
    expect(nextMonthISO(jan15)).toBe('2026-02-15');
  });

  it('accepts explicit `now` for testability', () => {
    const custom = new Date('2026-12-25T12:00:00Z');
    expect(todayISO(custom)).toBe('2026-12-25');
    expect(tomorrowISO(custom)).toBe('2026-12-26');
    expect(nextWeekISO(custom)).toBe('2027-01-01');
  });
});
```

- [ ] **Step 2: Run, expect failure**

```bash
pnpm test lib/core/date-shortcuts.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// lib/core/date-shortcuts.ts
import { addDays, addMonths, format, getDate, lastDayOfMonth, setDate } from 'date-fns';

function fmt(d: Date): string {
  return format(d, 'yyyy-MM-dd');
}

export function todayISO(now: Date = new Date()): string {
  return fmt(now);
}

export function tomorrowISO(now: Date = new Date()): string {
  return fmt(addDays(now, 1));
}

export function nextWeekISO(now: Date = new Date()): string {
  return fmt(addDays(now, 7));
}

export function nextMonthISO(now: Date = new Date()): string {
  const target = addMonths(now, 1);
  const lastDay = getDate(lastDayOfMonth(target));
  const clampedDay = Math.min(getDate(now), lastDay);
  return fmt(setDate(target, clampedDay));
}
```

- [ ] **Step 4: Run, expect pass**

```bash
pnpm test lib/core/date-shortcuts.test.ts
```

Expected: all 9 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/core/date-shortcuts.ts lib/core/date-shortcuts.test.ts
git commit -m "feat(core): date shortcuts for deadline picker (today, tomorrow, +week, +month with clamp)"
```

---

## Task 3: `DeadlinePicker` component

**Files:**
- Create: `components/DeadlinePicker.tsx`

- [ ] **Step 1: Write the component**

```tsx
// components/DeadlinePicker.tsx
'use client';
import { useState, useEffect } from 'react';
import { DayPicker } from 'react-day-picker';
import { parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import 'react-day-picker/style.css';
import { todayISO, tomorrowISO, nextWeekISO, nextMonthISO } from '@/lib/core/date-shortcuts';

type Props = {
  value: string | null;                          // ISO YYYY-MM-DD or null
  onChange: (next: string | null) => void;
};

const BTN_CLASS =
  'bg-white text-slate-900 text-xs px-2.5 py-1.5 rounded border border-slate-200 font-medium hover:bg-slate-100 transition';

export function DeadlinePicker({ value, onChange }: Props) {
  const selected = value ? parseISO(value) : undefined;
  const [month, setMonth] = useState<Date>(selected ?? new Date());

  // Keep the visible month in sync with `value` when it changes from outside
  // (e.g., switching cards in the panel)
  useEffect(() => {
    if (selected) setMonth(selected);
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps

  function apply(iso: string) {
    setMonth(parseISO(iso));
    onChange(iso);
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        <button type="button" className={BTN_CLASS} onClick={() => apply(todayISO())}>Hoje</button>
        <button type="button" className={BTN_CLASS} onClick={() => apply(tomorrowISO())}>Amanhã</button>
        <button type="button" className={BTN_CLASS} onClick={() => apply(nextWeekISO())}>Próxima semana</button>
        <button type="button" className={BTN_CLASS} onClick={() => apply(nextMonthISO())}>Próximo mês</button>
      </div>
      <DayPicker
        mode="single"
        locale={ptBR}
        month={month}
        onMonthChange={setMonth}
        selected={selected}
        onSelect={(d) => { if (d) apply(d.toISOString().slice(0, 10)); }}
        showOutsideDays
      />
      <button
        type="button"
        onClick={() => onChange(null)}
        className={`text-xs text-rose-400 hover:text-rose-300 transition ${value ? '' : 'hidden'}`}
      >
        × Remover prazo
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Verify TS compiles**

```bash
pnpm tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 3: Commit**

```bash
git add components/DeadlinePicker.tsx
git commit -m "feat(ui): DeadlinePicker component (calendar + 4 shortcut buttons)"
```

---

## Task 4: Theme `react-day-picker` for dark mode

**Files:**
- Modify: `app/globals.css`

- [ ] **Step 1: Append the override block to `app/globals.css`**

Append at the end of the file (after the existing scrollbar rules):

```css
/* react-day-picker dark theme overrides */
.rdp-root {
  --rdp-accent-color: var(--color-mt-accent);
  --rdp-background-color: var(--color-mt-card);
  --rdp-day-disabled-color: var(--color-mt-muted);
  --rdp-day-selected-color: white;
  color: var(--color-mt-text);
  font-size: 12px;
}
.rdp-month_caption { color: var(--color-mt-text); font-weight: 600; }
.rdp-weekday { color: var(--color-mt-muted); font-weight: 500; text-transform: lowercase; }
.rdp-day { color: var(--color-mt-text); }
.rdp-day_button:hover:not([disabled]) { background: var(--color-mt-line); }
.rdp-selected .rdp-day_button {
  background: var(--color-mt-accent);
  color: white;
}
.rdp-today:not(.rdp-selected) .rdp-day_button {
  border: 1px solid var(--color-mt-accent);
}
.rdp-outside { opacity: 0.4; }
.rdp-nav button {
  color: var(--color-mt-text);
  background: transparent;
}
.rdp-nav button:hover { background: var(--color-mt-line); }
```

- [ ] **Step 2: Commit**

```bash
git add app/globals.css
git commit -m "feat(ui): theme react-day-picker for martrello dark mode"
```

---

## Task 5: Wire `DeadlinePicker` into `CardPanel`

**Files:**
- Modify: `components/CardPanel.tsx`

- [ ] **Step 1: Locate the existing deadline section**

In `components/CardPanel.tsx`, find this block (currently around lines 91–102):

```tsx
        <section>
          <div className="text-xs text-[var(--color-mt-muted)] mb-1">Prazo</div>
          <input
            type="text"
            defaultValue={card.dueDate ?? ''}
            placeholder="2026-06-15 ou amanhã / sex / +3d"
            onBlur={(e) => saveDue(e.target.value)}
            className="w-full bg-[var(--color-mt-card)] p-2 rounded text-xs"
          />
        </section>
```

- [ ] **Step 2: Replace with the picker**

Replace the block above with:

```tsx
        <section>
          <div className="text-xs text-[var(--color-mt-muted)] mb-1">Prazo</div>
          <DeadlinePicker
            value={card.dueDate}
            onChange={(next) =>
              start(async () => {
                await updateCardAction(card.id, { dueDate: next });
                mutate();
              })
            }
          />
        </section>
```

- [ ] **Step 3: Add the import at the top of the file**

In the import block of `components/CardPanel.tsx`, add:

```tsx
import { DeadlinePicker } from './DeadlinePicker';
```

- [ ] **Step 4: Remove the now-unused `saveDue` helper**

Inside the `CardPanel` component, find and delete this function (currently below `saveDesc`):

```tsx
  function saveDue(input: string) {
    start(async () => {
      await updateCardAction(card.id, { dueDate: input || null });
      mutate();
    });
  }
```

- [ ] **Step 5: Verify TS compiles**

```bash
pnpm tsc --noEmit
```

Expected: zero errors. If any imports become unused after the change, remove them.

- [ ] **Step 6: Run full test suite**

```bash
pnpm test
```

Expected: all tests pass (no test file directly covers `CardPanel`, but other suites must not regress).

- [ ] **Step 7: Commit**

```bash
git add components/CardPanel.tsx
git commit -m "feat(ui): use DeadlinePicker in CardPanel; drop free-text input + saveDue"
```

---

## Task 6: Manual smoke test

This is a hands-on UI verification — no code. Run through the checklist below.

**Files:** none changed.

- [ ] **Step 1: Boot the dev server**

```bash
pnpm dev
```

Wait until `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000` returns `200` or `307`.

- [ ] **Step 2: Run through this checklist in the browser**

Open `http://localhost:3000`, navigate to a project, click any card to open the side panel, and verify:

| # | Action | Expected |
|---|--------|----------|
| 1 | Open card with no deadline | Calendar shows current month, today has a border, no day is filled-selected, "Remover prazo" is **not** visible. |
| 2 | Click "Hoje" | Today fills (accent background), "Remover prazo" appears, refresh from MCP / sqlite shows the date persisted. |
| 3 | Click "Amanhã" | Tomorrow becomes selected; if crossing into next month, the calendar advances. |
| 4 | Click "Próxima semana" | Same weekday + 7 days becomes selected; calendar advances month if needed. |
| 5 | Click "Próximo mês" | Calendar advances one month, same day-of-month selected (or last day if clamp). |
| 6 | Click "Próximo mês" again from May 31 | Lands on Jun 30 (clamp verified). |
| 7 | Click a non-shortcut day in the grid | That day persists. |
| 8 | Click "Remover prazo" | Date is cleared, "Remover prazo" hides, no day stays selected. |
| 9 | Use arrow nav `◂` / `▸` to scroll months | Month changes; selected day still highlighted if visible. |
| 10 | Switch to another card without closing the panel | Picker re-initializes to that card's date (or null). |

- [ ] **Step 3: Verify a date persists via the DB**

In another terminal:

```bash
sqlite3 martrello.db "SELECT id, title, due_date FROM cards WHERE due_date IS NOT NULL ORDER BY updated_at DESC LIMIT 5;"
```

Expected: the cards you just edited appear with `YYYY-MM-DD` dates.

- [ ] **Step 4: Stop dev server**

Ctrl-C in the dev server terminal.

- [ ] **Step 5: Final test suite run**

```bash
pnpm test
```

Expected: all green.

- [ ] **Step 6: Push the branch**

```bash
git push -u origin feat/deadline-date-picker
```

- [ ] **Step 7: Open the PR**

```bash
gh pr create --base main --head feat/deadline-date-picker \
  --title "feat(ui): visual deadline picker (calendar + shortcut buttons)" \
  --body "$(cat <<'EOF'
## Summary

- Replaces the free-text deadline input in \`CardPanel\` with a \`react-day-picker\` calendar plus 4 shortcut buttons (Hoje, Amanhã, Próxima semana, Próximo mês), per [docs/superpowers/specs/2026-05-27-deadline-date-picker-design.md](docs/superpowers/specs/2026-05-27-deadline-date-picker-design.md).
- Date shortcut math (with end-of-month clamp) lives in \`lib/core/date-shortcuts.ts\`, fully unit-tested.
- The pt-BR parser in \`lib/core/dates.ts\` is untouched — still used by the MCP path when Claude receives \`"prazo sex"\` via natural language.

## Test plan

- [ ] \`pnpm test\` — expect 80+ passing (was 72; +9 shortcut tests)
- [ ] \`pnpm dev\` — open a card, walk through the 10-step manual checklist in the plan, confirm persistence in \`sqlite3 martrello.db\`

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Self-review notes

- **Spec coverage:** every section of the spec maps to a task — install (Task 1), helpers + clamp rule + tests (Task 2), component contract + buttons + always-visible calendar + remover (Task 3), CSS overrides (Task 4), CardPanel wiring + parser-untouched (Task 5), manual checklist + persistence + PR (Task 6).
- **No placeholders:** every step has either a real command, real code, or a concrete manual check.
- **Type consistency:** `todayISO`/`tomorrowISO`/`nextWeekISO`/`nextMonthISO` defined in Task 2 are imported with those exact names in Task 3. `DeadlinePicker` props (`value: string | null`, `onChange: (next: string | null) => void`) defined in Task 3 are consumed identically in Task 5.
- **One adjustment from the spec:** the CSS selectors target real `react-day-picker` v9 class names (`.rdp-root`, `.rdp-day_button`, `.rdp-selected`, `.rdp-today`, `.rdp-outside`, `.rdp-nav`) instead of the data-attribute selectors mentioned tentatively in the spec. v9 uses class names primarily; if visual inspection during Task 6 finds gaps, tweak inline.
