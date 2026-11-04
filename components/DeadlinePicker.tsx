'use client';
import { useState, useEffect } from 'react';
import { DayPicker } from 'react-day-picker';
import { parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { X } from 'lucide-react';
import 'react-day-picker/style.css';
import { todayISO, tomorrowISO, nextWeekISO, nextMonthISO } from '@/lib/core/date-shortcuts';

type Props = {
  value: string | null;                          // ISO YYYY-MM-DD or null
  onChange: (next: string | null) => void;
};

const SHORTCUT_CLASS = 'btn btn-secondary !px-2.5 !py-1 !text-[12px]';

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
        <button type="button" className={SHORTCUT_CLASS} onClick={() => apply(todayISO())}>Hoje</button>
        <button type="button" className={SHORTCUT_CLASS} onClick={() => apply(tomorrowISO())}>Amanhã</button>
        <button type="button" className={SHORTCUT_CLASS} onClick={() => apply(nextWeekISO())}>Próxima semana</button>
        <button type="button" className={SHORTCUT_CLASS} onClick={() => apply(nextMonthISO())}>Próximo mês</button>
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
      {value && (
        <button
          type="button"
          onClick={() => onChange(null)}
          className="btn btn-danger-ghost !px-2 !py-1 !text-[12px]"
        >
          <X size={13} strokeWidth={2} aria-hidden="true" />
          Remover prazo
        </button>
      )}
    </div>
  );
}
