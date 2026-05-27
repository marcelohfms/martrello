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
