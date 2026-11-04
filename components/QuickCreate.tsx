'use client';
import { useState, useTransition } from 'react';
import { Plus } from 'lucide-react';
import { quickCreateCardAction } from '@/app/actions';

type Props = { projectId: string; listId: string };

export function QuickCreate({ projectId, listId }: Props) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [pending, start] = useTransition();

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
        onClick={() => setOpen(true)}
        className="btn btn-ghost w-full justify-start"
        aria-label="Adicionar novo card"
      >
        <Plus size={14} strokeWidth={2} aria-hidden="true" />
        Novo card
      </button>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-2"
      aria-label="Formulário: novo card"
    >
      <input
        autoFocus
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        placeholder="Título do card…"
        disabled={pending}
        aria-label="Título do novo card"
        className="field"
      />
      <div className="flex items-center gap-1.5">
        <button
          type="submit"
          disabled={pending || !title.trim()}
          className="btn btn-primary"
        >
          {pending ? 'Adicionando…' : 'Adicionar'}
        </button>
        <button
          type="button"
          onMouseDown={(e) => {
            // prevent input blur before button click
            e.preventDefault();
            close();
          }}
          className="btn btn-ghost"
          aria-label="Cancelar criação de card"
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}
