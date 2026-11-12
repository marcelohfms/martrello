'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { CopyButton } from '@/components/CopyButton';
import {
  inviteAction,
  resendInviteAction,
  cancelInviteAction,
  deactivateUserAction,
  reactivateUserAction,
  type InviteResult,
  type AdminResult,
} from './actions';

type Person = { id: string; name: string; email: string; role: 'admin' | 'member'; disabled: boolean; projectCount: number };
type Invite = { inviteId: string; email: string; name: string; expiresAt: number };

const dateFmt = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });

function LinkNotice({ link, warning, onClose }: { link: string; warning?: string; onClose: () => void }) {
  return (
    <div className="rounded-[var(--radius-md)] border border-mt-line bg-mt-card p-3 text-[13px]">
      <p className="mb-2 text-mt-muted">
        {warning ?? 'O envio de e-mail não está configurado. Copie o link e envie para a pessoa.'}
      </p>
      <div className="flex items-center gap-2">
        <input readOnly value={link} aria-label="Link do convite" onFocus={(e) => e.currentTarget.select()} className="field !text-[13px]" />
        <CopyButton value={link} />
        <button type="button" onClick={onClose} className="btn btn-ghost shrink-0">Fechar</button>
      </div>
    </div>
  );
}

export function PeopleSection({ users, invites, currentUserId }: { users: Person[]; invites: Invite[]; currentUserId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [link, setLink] = useState<{ url: string; warning?: string } | null>(null);

  function handleInvite(r: InviteResult, okMessage: string) {
    if ('error' in r) {
      setError(r.error);
      return false;
    }
    setError(null);
    if (r.link) {
      setLink({ url: r.link, warning: r.warning });
      setNotice(null);
    } else {
      setLink(null);
      setNotice(okMessage);
    }
    router.refresh();
    return true;
  }

  function handleResult(r: AdminResult) {
    if ('error' in r) setError(r.error);
    else {
      setError(null);
      router.refresh();
    }
  }

  function submitInvite(e: React.FormEvent) {
    e.preventDefault();
    start(async () => {
      const r = await inviteAction({ name, email });
      if (handleInvite(r, `Convite enviado para ${email.trim()}.`)) {
        setName('');
        setEmail('');
      }
    });
  }

  const active = users.filter((u) => !u.disabled);
  const disabled = users.filter((u) => u.disabled);

  return (
    <section aria-labelledby="people-h" className="flex flex-col gap-4">
      <h2 id="people-h" className="text-[16px] font-bold tracking-[-0.01em] text-mt-heading">Pessoas</h2>

      <form onSubmit={submitInvite} className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <label className="flex flex-1 flex-col gap-1.5 text-[13px] font-semibold text-mt-heading">
          Nome
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} required autoComplete="off" className="field !text-[14px] font-normal" />
        </label>
        <label className="flex flex-1 flex-col gap-1.5 text-[13px] font-semibold text-mt-heading">
          E-mail
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="off" className="field !text-[14px] font-normal" />
        </label>
        <button type="submit" disabled={pending} className="btn btn-primary !py-2.5">
          {pending ? 'Enviando' : 'Convidar'}
        </button>
      </form>

      <p role="alert" className="min-h-[20px] text-[13px] text-mt-danger">{error}</p>
      {notice && <p role="status" className="text-[13px] text-mt-muted">{notice}</p>}
      {link && <LinkNotice link={link.url} warning={link.warning} onClose={() => setLink(null)} />}

      <ul className="divide-y divide-mt-line rounded-[var(--radius-md)] border border-mt-line bg-mt-card">
        {active.map((u) => (
          <li key={u.id} className="flex items-center gap-3 px-3 py-2.5 text-[14px]">
            <div className="min-w-0 flex-1">
              <div className="truncate font-semibold text-mt-heading">
                {u.name}
                {u.role === 'admin' && <span className="label-caps ml-2 text-mt-muted">Admin</span>}
              </div>
              <div className="truncate text-[13px] text-mt-muted">{u.email}</div>
            </div>
            <span className="hidden shrink-0 text-[13px] text-mt-muted sm:inline">
              {u.projectCount} {u.projectCount === 1 ? 'projeto' : 'projetos'}
            </span>
            {u.id !== currentUserId && (
              <button
                type="button"
                disabled={pending}
                className="btn btn-danger-ghost shrink-0"
                onClick={() => {
                  if (!window.confirm(`Desativar ${u.name}? A pessoa perde o acesso agora e as tarefas em A fazer e Fazendo voltam para o Backlog.`)) return;
                  start(async () => handleResult(await deactivateUserAction(u.id)));
                }}
              >
                Desativar
              </button>
            )}
          </li>
        ))}
      </ul>

      {invites.length > 0 && (
        <div className="flex flex-col gap-2">
          <h3 className="label-caps text-mt-muted">Convites pendentes</h3>
          <ul className="divide-y divide-mt-line rounded-[var(--radius-md)] border border-mt-line bg-mt-card">
            {invites.map((i) => (
              <li key={i.inviteId} className="flex items-center gap-3 px-3 py-2.5 text-[14px]">
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold text-mt-heading">{i.name || i.email}</div>
                  <div className="truncate text-[13px] text-mt-muted">
                    {i.email} <span aria-hidden="true">//</span> expira em {dateFmt.format(i.expiresAt)}
                  </div>
                </div>
                <button
                  type="button"
                  disabled={pending}
                  className="btn btn-secondary shrink-0"
                  onClick={() => start(async () => { handleInvite(await resendInviteAction(i.inviteId), `Convite reenviado para ${i.email}.`); })}
                >
                  Reenviar
                </button>
                <button
                  type="button"
                  disabled={pending}
                  className="btn btn-danger-ghost shrink-0"
                  onClick={() => start(async () => handleResult(await cancelInviteAction(i.inviteId)))}
                >
                  Cancelar
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {disabled.length > 0 && (
        <div className="flex flex-col gap-2">
          <h3 className="label-caps text-mt-muted">Desativadas</h3>
          <ul className="divide-y divide-mt-line rounded-[var(--radius-md)] border border-mt-line bg-mt-card">
            {disabled.map((u) => (
              <li key={u.id} className="flex items-center gap-3 px-3 py-2.5 text-[14px]">
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold text-mt-muted">{u.name}</div>
                  <div className="truncate text-[13px] text-mt-muted">{u.email}</div>
                </div>
                <button
                  type="button"
                  disabled={pending}
                  className="btn btn-secondary shrink-0"
                  onClick={() => start(async () => handleResult(await reactivateUserAction(u.id)))}
                >
                  Reativar
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
