'use client';
// components/SprintToggle.tsx
import { useState, useTransition } from 'react';
import { Undo2, Zap } from 'lucide-react';
import { addToSprintAction, removeFromSprintAction } from '@/app/actions';

export function sprintToggleLabel(inSprint: boolean) {
  return inSprint ? 'Mover para o Backlog (tirar da Sprint)' : 'Enviar para a Sprint';
}

type Props = { cardId: string; inSprint: boolean };

export function SprintToggle({ cardId, inSprint }: Props) {
  const [pending, start] = useTransition();
  const [failed, setFailed] = useState(false);

  const label = sprintToggleLabel(inSprint);
  const title = failed ? `Não foi possível concluir. ${label}` : label;

  return (
    <button
      type="button"
      aria-label={title}
      title={title}
      disabled={pending}
      // Keeps a press on the button from starting a card drag.
      onPointerDown={(e) => e.stopPropagation()}
      onClick={() => {
        setFailed(false);
        start(async () => {
          try {
            await (inSprint ? removeFromSprintAction(cardId) : addToSprintAction(cardId));
          } catch {
            setFailed(true);
          }
        });
      }}
      className={`
        absolute right-1.5 top-1.5
        flex size-7 cursor-pointer items-center justify-center rounded-[var(--radius-sm)]
        transition-colors duration-[var(--duration-fast)] ease-out
        disabled:cursor-wait disabled:opacity-50
        pointer-coarse:after:absolute pointer-coarse:after:-inset-2
        ${failed ? 'text-mt-danger hover:bg-mt-danger-soft' : 'text-ax-green-800 hover:bg-mt-list hover:text-mt-heading'}
      `}
    >
      {inSprint
        ? <Undo2 size={15} strokeWidth={2} aria-hidden="true" />
        : <Zap size={15} strokeWidth={2} aria-hidden="true" />
      }
    </button>
  );
}
