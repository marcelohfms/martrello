// components/CardPanel.tsx
'use client';
import { useState, useTransition } from 'react';
import useSWR from 'swr';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { updateCardAction, toggleLabelAction, archiveCardAction, addToSprintAction, removeFromSprintAction } from '@/app/actions';

const fetcher = (url: string) => fetch(url).then((r) => r.json());

type Props = { cardId: string; onClose: () => void };

export function CardPanel({ cardId, onClose }: Props) {
  const { data, mutate } = useSWR(`/api/card/${cardId}`, fetcher, { refreshInterval: 3000, revalidateOnFocus: true });
  const [editingDesc, setEditingDesc] = useState(false);
  const [descDraft, setDescDraft] = useState('');
  const [titleDraft, setTitleDraft] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (!data) return null;
  const card = data.card as { id: string; title: string; description: string | null; dueDate: string | null; labels: Array<{ name: string; color: string }> };
  const allLabels = data.allLabels as Array<{ name: string; color: string }>;
  const presentNames = new Set(card.labels.map((l) => l.name));

  function saveTitle() {
    if (titleDraft == null || titleDraft === card.title) { setTitleDraft(null); return; }
    start(async () => {
      await updateCardAction(card.id, { title: titleDraft });
      setTitleDraft(null);
      mutate();
    });
  }

  function saveDesc() {
    start(async () => {
      await updateCardAction(card.id, { description: descDraft });
      setEditingDesc(false);
      mutate();
    });
  }

  function saveDue(input: string) {
    start(async () => {
      await updateCardAction(card.id, { dueDate: input || null });
      mutate();
    });
  }

  return (
    <div className="fixed inset-y-0 right-0 w-[420px] bg-[#0a1622] border-l border-[var(--color-mt-line)] z-40 flex flex-col">
      <header className="px-4 py-3 border-b border-[var(--color-mt-line)] flex items-center justify-between">
        <input
          value={titleDraft ?? card.title}
          onChange={(e) => setTitleDraft(e.target.value)}
          onBlur={saveTitle}
          onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setTitleDraft(null); }}
          className="bg-transparent text-sm font-semibold w-full mr-2 outline-none"
        />
        <button type="button" onClick={onClose} className="text-xs text-[var(--color-mt-muted)]">fechar</button>
      </header>
      <div className="flex-1 overflow-y-auto p-4 space-y-4 text-sm">
        <section>
          <div className="text-xs text-[var(--color-mt-muted)] mb-1">Descrição</div>
          {editingDesc ? (
            <div className="space-y-2">
              <textarea
                value={descDraft}
                onChange={(e) => setDescDraft(e.target.value)}
                className="w-full h-40 bg-[var(--color-mt-card)] p-2 rounded text-xs"
              />
              <div className="flex gap-2">
                <button type="button" disabled={pending} onClick={saveDesc} className="text-xs bg-[var(--color-mt-accent)] px-2 py-1 rounded">salvar</button>
                <button type="button" onClick={() => setEditingDesc(false)} className="text-xs">cancelar</button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => { setDescDraft(card.description ?? ''); setEditingDesc(true); }}
              className="w-full text-left bg-[var(--color-mt-card)] p-3 rounded text-xs leading-relaxed"
            >
              {card.description ? (
                <div className="prose prose-invert prose-sm max-w-none">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{card.description}</ReactMarkdown>
                </div>
              ) : (
                <span className="text-[var(--color-mt-muted)]">adicionar descrição</span>
              )}
            </button>
          )}
        </section>

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

        <section>
          <div className="text-xs text-[var(--color-mt-muted)] mb-1">Labels</div>
          <div className="flex flex-wrap gap-1.5">
            {allLabels.map((l) => {
              const on = presentNames.has(l.name);
              return (
                <button
                  type="button"
                  key={l.name}
                  onClick={() => start(async () => { await toggleLabelAction(card.id, l.name, on); mutate(); })}
                  className={`text-[10px] px-2 py-1 rounded ${on ? '' : 'opacity-40'}`}
                  style={{ background: l.color }}
                >
                  {l.name}
                </button>
              );
            })}
          </div>
        </section>

        <section className="flex flex-col gap-2">
          <button type="button" onClick={() => start(async () => { await addToSprintAction(card.id); mutate(); })} className="text-xs text-left text-[var(--color-mt-muted)] hover:text-[var(--color-mt-text)]">
            + adicionar ao Sprint
          </button>
          <button type="button" onClick={() => start(async () => { await removeFromSprintAction(card.id); mutate(); })} className="text-xs text-left text-[var(--color-mt-muted)] hover:text-[var(--color-mt-text)]">
            − tirar do Sprint
          </button>
          <button type="button" onClick={() => start(async () => { await archiveCardAction(card.id); onClose(); })} className="text-xs text-left text-rose-400">
            arquivar
          </button>
        </section>
      </div>
    </div>
  );
}
