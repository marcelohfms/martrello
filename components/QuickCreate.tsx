'use client';
import { useState, useTransition } from 'react';
import { quickCreateCardAction } from '@/app/actions';

type Props = { projectId: string; listId: string };

export function QuickCreate({ projectId, listId }: Props) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [pending, start] = useTransition();

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs text-[var(--color-mt-muted)] px-1 py-1.5 hover:text-[var(--color-mt-text)] text-left"
      >
        + novo card
      </button>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const t = title;
        start(async () => {
          await quickCreateCardAction(projectId, listId, t);
          setTitle('');
          setOpen(false);
        });
      }}
      className="flex flex-col gap-1"
    >
      <input
        autoFocus
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Título do card"
        className="bg-[var(--color-mt-card)] text-xs p-2 rounded outline-none border border-[var(--color-mt-line)]"
        onBlur={() => { if (!title) setOpen(false); }}
      />
      <button type="submit" disabled={pending} className="text-xs px-2 py-1 bg-[var(--color-mt-accent)] rounded self-start">
        {pending ? '...' : 'adicionar'}
      </button>
    </form>
  );
}
