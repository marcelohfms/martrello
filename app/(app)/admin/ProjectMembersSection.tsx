'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ProjectLabel } from '@/components/ProjectLabel';
import { useProjectPrivacy } from '@/components/ProjectPrivacyContext';
import type { ActionResult as AdminResult } from '@/lib/action-result';
import { addMemberAction, removeMemberAction } from './actions';
import { SlackChannelPicker } from './SlackChannelPicker';
import type { SlackSetup } from './slack-channel';
import { removeMemberConfirmMessage } from './remove-member-message';

type Member = { id: string; name: string; email: string; disabled: boolean; isAdmin: boolean };
type ProjectRow = {
  id: string;
  name: string;
  acronym: string;
  color: string;
  members: Member[];
  slack: { saved: { id: string; name: string } | null; status: string };
};

export function ProjectMembersSection({ projects, people, slackSetup }: { projects: ProjectRow[]; people: { id: string; name: string }[]; slackSetup: SlackSetup }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const { revealed } = useProjectPrivacy();

  function handle(r: AdminResult) {
    if ('error' in r) setError(r.error);
    else {
      setError(null);
      router.refresh();
    }
  }

  return (
    <section aria-labelledby="projects-h" className="flex flex-col gap-4">
      <h2 id="projects-h" className="text-[16px] font-bold tracking-[-0.01em] text-mt-heading">Projetos</h2>
      <p role="alert" className="min-h-[20px] text-[13px] text-mt-danger">{error}</p>
      {projects.length === 0 && <p className="text-[13px] text-mt-muted">Nenhum projeto ainda.</p>}
      {projects.map((p) => {
        const memberIds = new Set(p.members.map((m) => m.id));
        const candidates = people.filter((u) => !memberIds.has(u.id));
        return (
          <div key={p.id} className="rounded-[var(--radius-md)] border border-mt-line bg-mt-card">
            <div className="flex items-center gap-3 border-b border-mt-line px-3 py-2.5 text-[14px]">
              <ProjectLabel name={p.name} acronym={p.acronym} color={p.color} />
              <span className="ml-auto text-[13px] text-mt-muted">
                {p.members.length} {p.members.length === 1 ? 'membro' : 'membros'}
              </span>
            </div>
            <ul className="divide-y divide-mt-line">
              {p.members.map((m) => (
                <li key={m.id} className="flex items-center gap-3 px-3 py-2 text-[14px]">
                  <span className={`min-w-0 flex-1 truncate ${m.disabled ? 'text-mt-muted' : 'text-mt-heading'}`}>
                    {m.name}
                    {m.disabled && <span className="ml-2 text-[12px]">desativada</span>}
                  </span>
                  {!m.isAdmin && <button
                    type="button"
                    disabled={pending}
                    className="btn btn-ghost shrink-0"
                    aria-label={`Remover ${m.name} do projeto`}
                    onClick={() => {
                      if (!window.confirm(removeMemberConfirmMessage(m.name, revealed ? p.name : p.acronym))) return;
                      start(async () => handle(await removeMemberAction(p.id, m.id)));
                    }}
                  >
                    Remover
                  </button>}
                </li>
              ))}
            </ul>
            {candidates.length > 0 && (
              <div className="border-t border-mt-line px-3 py-2">
                <select
                  aria-label="Adicionar pessoa ao projeto"
                  className="field !text-[13px]"
                  value=""
                  disabled={pending}
                  onChange={(e) => {
                    const userId = e.target.value;
                    if (userId) start(async () => handle(await addMemberAction(p.id, userId)));
                  }}
                >
                  <option value="">Adicionar pessoa</option>
                  {candidates.map((u) => (
                    <option key={u.id} value={u.id}>{u.name}</option>
                  ))}
                </select>
              </div>
            )}
            <div className="border-t border-mt-line px-3 py-2">
              <SlackChannelPicker
                projectId={p.id}
                setup={slackSetup}
                saved={p.slack.saved}
                status={p.slack.status}
                disabled={pending}
                onResult={handle}
                run={start}
              />
            </div>
          </div>
        );
      })}
    </section>
  );
}
