// components/CardPanel.tsx
'use client';
import { useEffect, useState, useTransition } from 'react';
import useSWR from 'swr';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Archive, Check, X } from 'lucide-react';
import { updateCardAction, toggleLabelAction, archiveCardAction, addDependencyAction, removeDependencyAction, assignCardAction } from '@/app/actions';
import { DeadlinePicker } from './DeadlinePicker';
import { AssigneePicker, type Member } from './AssigneePicker';
import { CardHistory } from './CardHistory';
import type { HistoryEvent } from './card-format';

const fetcher = (url: string) => fetch(url).then((r) => r.json());

type Props = { cardId: string; onClose: () => void };

const PANEL_CLASS =
  'fixed inset-y-0 right-0 z-40 flex w-full flex-col border-l border-mt-line bg-mt-card shadow-raised sm:w-[440px]';

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <div className="label-caps mb-2 text-mt-muted">{children}</div>;
}

function CloseButton({ onClose }: { onClose: () => void }) {
  return (
    <button type="button" onClick={onClose} aria-label="Fechar painel" className="btn btn-ghost !p-1.5 shrink-0">
      <X size={16} strokeWidth={2} aria-hidden="true" />
    </button>
  );
}

export function CardPanel({ cardId, onClose }: Props) {
  const { data, mutate } = useSWR(`/api/card/${cardId}`, fetcher, { refreshInterval: 3000, revalidateOnFocus: true });
  const [editingDesc, setEditingDesc] = useState(false);
  const [descDraft, setDescDraft] = useState('');
  const [titleDraft, setTitleDraft] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [depError, setDepError] = useState<string | null>(null);
  const [assignError, setAssignError] = useState<string | null>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Escape') return;
      // Escape inside a field cancels that edit first; the panel closes on the next press.
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (!data?.card) {
    return (
      <aside aria-label="Carregando card" aria-busy="true" className={PANEL_CLASS}>
        <header className="flex items-center justify-between gap-3 border-b border-mt-line px-5 py-3">
          <div className="h-5 w-2/3 animate-pulse rounded-[var(--radius-sm)] bg-mt-list" />
          <CloseButton onClose={onClose} />
        </header>
        <div className="space-y-3 p-5">
          <div className="h-3 w-24 animate-pulse rounded-[var(--radius-sm)] bg-mt-list" />
          <div className="h-24 animate-pulse rounded-[var(--radius-md)] bg-mt-list" />
          <div className="h-3 w-16 animate-pulse rounded-[var(--radius-sm)] bg-mt-list" />
          <div className="h-48 animate-pulse rounded-[var(--radius-md)] bg-mt-list" />
        </div>
      </aside>
    );
  }

  const card = data.card as {
    id: string;
    title: string;
    description: string | null;
    dueDate: string | null;
    labels: Array<{ name: string; color: string }>;
    dependsOn: Array<{ id: string; title: string; isDone: boolean }>;
    stage: string;
    assignee: { name: string; email: string; disabled: boolean } | null;
  };
  const allLabels = data.allLabels as Array<{ name: string; color: string }>;
  const presentNames = new Set(card.labels.map((l) => l.name));
  const dependsOn = card.dependsOn as Array<{ id: string; title: string; isDone: boolean }>;
  const candidateCards = (data.candidateCards ?? []) as Array<{ id: string; title: string }>;
  const linkedIds = new Set(dependsOn.map((d) => d.id));
  const members = (data.members ?? []) as Member[];
  const history = (data.history ?? []) as Array<HistoryEvent & { id: string }>;
  const nameByEmail = Object.fromEntries(members.map((m) => [m.email, m.name]));

  function assign(next: string | null) {
    setAssignError(null);
    start(async () => {
      const res = await assignCardAction(card.id, next);
      if ('error' in res) setAssignError(res.error);
      mutate();
    });
  }

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
    <aside aria-label="Detalhes do card" className={PANEL_CLASS}>
      <header className="flex items-center justify-between gap-3 border-b border-mt-line px-5 py-3">
        <input
          value={titleDraft ?? card.title}
          onChange={(e) => setTitleDraft(e.target.value)}
          onBlur={saveTitle}
          onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setTitleDraft(null); }}
          aria-label="Título do card"
          className="w-full min-w-0 rounded-[var(--radius-sm)] bg-transparent px-1 py-0.5 text-[16px] font-bold tracking-[-0.01em] text-mt-heading hover:bg-mt-bg"
        />
        <CloseButton onClose={onClose} />
      </header>

      <div className="flex-1 space-y-6 overflow-y-auto px-5 py-5">
        <section>
          <SectionLabel>Descrição</SectionLabel>
          {editingDesc ? (
            <div className="space-y-2">
              <textarea
                value={descDraft}
                onChange={(e) => setDescDraft(e.target.value)}
                aria-label="Descrição do card"
                className="field h-40 resize-y"
              />
              <div className="flex gap-1.5">
                <button type="button" disabled={pending} onClick={saveDesc} className="btn btn-primary">
                  {pending ? 'Salvando…' : 'Salvar'}
                </button>
                <button type="button" onClick={() => setEditingDesc(false)} className="btn btn-ghost">Cancelar</button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => { setDescDraft(card.description ?? ''); setEditingDesc(true); }}
              className="w-full cursor-pointer rounded-[var(--radius-md)] border border-mt-line bg-mt-bg p-3 text-left transition-colors duration-[var(--duration-fast)] ease-out hover:border-mt-line-strong"
            >
              {card.description ? (
                <div className="md-body">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{card.description}</ReactMarkdown>
                </div>
              ) : (
                <span className="text-[13px] text-mt-muted">Adicionar descrição</span>
              )}
            </button>
          )}
        </section>

        <section>
          <SectionLabel>Responsável</SectionLabel>
          <AssigneePicker
            members={members}
            current={card.assignee}
            allowNone={card.stage === 'backlog'}
            disabled={pending}
            onChange={assign}
          />
          {assignError && <p role="alert" className="mt-1.5 text-[13px] text-mt-danger">{assignError}</p>}
        </section>

        <section>
          <SectionLabel>Prazo</SectionLabel>
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
          <SectionLabel>Labels</SectionLabel>
          {allLabels.length === 0 ? (
            <p className="text-[13px] text-mt-muted">Nenhuma label criada.</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {allLabels.map((l) => {
                const on = presentNames.has(l.name);
                return (
                  <button
                    type="button"
                    key={l.name}
                    aria-pressed={on}
                    onClick={() => start(async () => { await toggleLabelAction(card.id, l.name, on); mutate(); })}
                    className={`
                      inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px] font-medium
                      transition-colors duration-[var(--duration-fast)] ease-out
                      ${on
                        ? 'border-ax-green-950 bg-ax-green-950 text-ax-greige-400'
                        : 'border-mt-line-strong text-mt-text hover:bg-mt-list'
                      }
                    `}
                  >
                    {on
                      ? <Check size={12} strokeWidth={2.5} aria-hidden="true" />
                      : <span className="size-2 rounded-full" style={{ background: l.color }} aria-hidden="true" />
                    }
                    {l.name}
                  </button>
                );
              })}
            </div>
          )}
        </section>

        <section>
          <SectionLabel>Depende de</SectionLabel>
          {dependsOn.length === 0 ? (
            <p className="mb-2 text-[13px] text-mt-muted">Nenhuma dependência.</p>
          ) : (
            <ul className="mb-2 space-y-1">
              {dependsOn.map((d) => (
                <li
                  key={d.id}
                  className="flex items-center justify-between gap-2 rounded-[var(--radius-md)] border border-mt-line bg-mt-bg py-1 pl-3 pr-1 text-[13px]"
                >
                  <span className={d.isDone ? 'text-mt-muted line-through' : 'text-mt-text'}>
                    {d.title}
                  </span>
                  <button
                    type="button"
                    onClick={() => start(async () => { await removeDependencyAction(card.id, d.id); mutate(); })}
                    className="btn btn-danger-ghost !px-2 !py-1 !text-[12px] shrink-0"
                  >
                    Remover
                  </button>
                </li>
              ))}
            </ul>
          )}
          <select
            value=""
            aria-label="Adicionar pré-requisito"
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
            className="field cursor-pointer"
          >
            <option value="">Adicionar pré-requisito…</option>
            {candidateCards
              .filter((c) => !linkedIds.has(c.id))
              .map((c) => (
                <option key={c.id} value={c.id}>{c.title}</option>
              ))}
          </select>
          {depError && <p role="alert" className="mt-1.5 text-[13px] text-mt-danger">{depError}</p>}
        </section>

        <section>
          <SectionLabel>Histórico</SectionLabel>
          <CardHistory events={history} nameByEmail={nameByEmail} />
        </section>
      </div>

      <footer className="flex flex-wrap items-center gap-1 border-t border-mt-line px-3 py-2">
        <button type="button" onClick={() => start(async () => { await archiveCardAction(card.id); onClose(); })} className="btn btn-danger-ghost ml-auto">
          <Archive size={14} strokeWidth={2} aria-hidden="true" />
          Arquivar
        </button>
      </footer>
    </aside>
  );
}
