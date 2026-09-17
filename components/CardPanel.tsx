// components/CardPanel.tsx
'use client';
import { useState, useTransition } from 'react';
import useSWR from 'swr';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { updateCardAction, toggleLabelAction, archiveCardAction, addToSprintAction, removeFromSprintAction, addDependencyAction, removeDependencyAction } from '@/app/actions';
import { DeadlinePicker } from './DeadlinePicker';

const fetcher = (url: string) => fetch(url).then((r) => r.json());

type Props = { cardId: string; onClose: () => void };

export function CardPanel({ cardId, onClose }: Props) {
  const { data, mutate } = useSWR(`/api/card/${cardId}`, fetcher, { refreshInterval: 3000, revalidateOnFocus: true });
  const [editingDesc, setEditingDesc] = useState(false);
  const [descDraft, setDescDraft] = useState('');
  const [titleDraft, setTitleDraft] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [depError, setDepError] = useState<string | null>(null);

  if (!data) return null;
  const card = data.card as {
    id: string;
    title: string;
    description: string | null;
    dueDate: string | null;
    labels: Array<{ name: string; color: string }>;
    dependsOn: Array<{ id: string; title: string; isDone: boolean }>;
  };
  const allLabels = data.allLabels as Array<{ name: string; color: string }>;
  const presentNames = new Set(card.labels.map((l) => l.name));
  const dependsOn = card.dependsOn as Array<{ id: string; title: string; isDone: boolean }>;
  const candidateCards = (data.candidateCards ?? []) as Array<{ id: string; title: string }>;
  const linkedIds = new Set(dependsOn.map((d) => d.id));

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

        <section>
          <div className="text-xs text-[var(--color-mt-muted)] mb-1">Depende de</div>
          {dependsOn.length === 0 ? (
            <p className="text-xs text-[var(--color-mt-muted)]">nenhuma dependência</p>
          ) : (
            <ul className="space-y-1 mb-2">
              {dependsOn.map((d) => (
                <li
                  key={d.id}
                  className="flex items-center justify-between gap-2 text-xs bg-[var(--color-mt-card)] px-2 py-1 rounded"
                >
                  <span className={d.isDone ? 'text-[var(--color-mt-muted)] line-through' : 'text-[var(--color-mt-text)]'}>
                    {d.title}
                  </span>
                  <button
                    type="button"
                    onClick={() => start(async () => { await removeDependencyAction(card.id, d.id); mutate(); })}
                    className="text-[var(--color-mt-danger)] shrink-0"
                  >
                    remover
                  </button>
                </li>
              ))}
            </ul>
          )}
          <select
            value=""
            onChange={(e) => {
              const blockerId = e.target.value;
              if (!blockerId) return;
              setDepError(null);
              start(async () => {
                try {
                  await addDependencyAction(card.id, blockerId);
                  mutate();
                } catch (err) {
                  setDepError(err instanceof Error ? err.message : 'Erro ao adicionar dependência');
                }
              });
            }}
            className="w-full text-xs bg-[var(--color-mt-card)] p-1.5 rounded text-[var(--color-mt-text)]"
          >
            <option value="">+ adicionar pré-requisito...</option>
            {candidateCards
              .filter((c) => !linkedIds.has(c.id))
              .map((c) => (
                <option key={c.id} value={c.id}>{c.title}</option>
              ))}
          </select>
          {depError && <p className="text-xs text-[var(--color-mt-danger)] mt-1">{depError}</p>}
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
