'use client';
import { useState, useTransition, useRef } from 'react';
import { quickCreateCardAction } from '@/app/actions';

type Props = { projectId: string; listId: string };

function PlusIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden="true">
      <path d="M6 1v10M1 6h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

export function QuickCreate({ projectId, listId }: Props) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [pending, start] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  function openForm() {
    setOpen(true);
    // focus happens via autoFocus on the input
  }

  function close() {
    setTitle('');
    setOpen(false);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = title.trim();
    if (!trimmed) return;
    start(async () => {
      await quickCreateCardAction(projectId, listId, trimmed);
      setTitle('');
      setOpen(false);
    });
  }

  function handleBlur() {
    // Only close if field is actually empty (user cancelled)
    if (!title.trim()) {
      close();
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') {
      close();
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={openForm}
        className="
          w-full flex items-center gap-1.5 px-1 py-1.5
          text-[12px] text-[var(--color-mt-muted)]
          hover:text-[var(--color-mt-muted-hi)]
          rounded-[var(--radius-sm)]
          transition-colors duration-[120ms]
          cursor-pointer
          group
        "
        aria-label="Adicionar novo card"
      >
        <span className="transition-transform duration-[120ms] group-hover:scale-110">
          <PlusIcon />
        </span>
        <span>novo card</span>
      </button>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-1.5"
      aria-label="Formulário: novo card"
    >
      <input
        ref={inputRef}
        autoFocus
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        placeholder="Título do card…"
        disabled={pending}
        aria-label="Título do novo card"
        className="
          bg-[var(--color-mt-card)]
          text-[13px] text-[var(--color-mt-text)]
          px-2.5 py-1.5
          rounded-[var(--radius-sm)]
          border border-[var(--color-mt-line)]
          placeholder:text-[var(--color-mt-muted)]
          focus:outline-2 focus:outline-[var(--color-mt-accent)] focus:outline-offset-0
          focus:border-[var(--color-mt-accent)]
          disabled:opacity-50
          transition-colors duration-[120ms]
          w-full
        "
      />
      <div className="flex items-center gap-1.5">
        <button
          type="submit"
          disabled={pending || !title.trim()}
          className="
            text-[12px] font-medium
            px-2.5 py-1
            bg-[var(--color-mt-accent)] text-white
            rounded-[var(--radius-sm)]
            disabled:opacity-40 disabled:cursor-not-allowed
            hover:bg-[var(--color-mt-accent-hi)]
            active:scale-95
            transition-all duration-[120ms]
            cursor-pointer
          "
        >
          {pending ? 'adicionando…' : 'adicionar'}
        </button>
        <button
          type="button"
          onMouseDown={(e) => {
            // prevent input blur before button click
            e.preventDefault();
            close();
          }}
          className="
            text-[12px] px-2 py-1
            text-[var(--color-mt-muted)]
            hover:text-[var(--color-mt-text)]
            rounded-[var(--radius-sm)]
            transition-colors duration-[120ms]
            cursor-pointer
          "
          aria-label="Cancelar criação de card"
        >
          cancelar
        </button>
      </div>
    </form>
  );
}
