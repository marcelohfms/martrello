'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { CopyButton } from '@/components/CopyButton';
import { createMcpTokenAction, revokeMcpTokenAction } from './actions';

type Token = { id: string; name: string; createdAt: number; lastUsedAt: number | null };

const dateFmt = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });

export function McpTokensSection({ tokens }: { tokens: Token[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [fresh, setFresh] = useState<string | null>(null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    start(async () => {
      const r = await createMcpTokenAction(name);
      if ('error' in r) {
        setError(r.error);
        return;
      }
      setError(null);
      setFresh(r.token);
      setName('');
      router.refresh();
    });
  }

  return (
    <section aria-labelledby="tokens-h" className="flex flex-col gap-4">
      <h2 id="tokens-h" className="text-[16px] font-bold tracking-[-0.01em] text-mt-heading">Tokens do MCP</h2>
      <p className="text-[13px] text-mt-muted">
        Tokens pessoais para conectar o martrello a um cliente MCP. Cada token age como você.
      </p>

      <form onSubmit={submit} className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <label className="flex flex-1 flex-col gap-1.5 text-[13px] font-semibold text-mt-heading">
          Nome do token
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} required autoComplete="off" className="field !text-[14px] font-normal" />
        </label>
        <button type="submit" disabled={pending} className="btn btn-primary !py-2.5">Gerar token</button>
      </form>
      <p role="alert" className="min-h-[20px] text-[13px] text-mt-danger">{error}</p>

      {fresh && (
        <div className="rounded-[var(--radius-md)] border border-mt-line bg-mt-card p-3 text-[13px]">
          <p className="mb-2 font-semibold text-mt-heading">Copie agora. Ele não será mostrado de novo.</p>
          <div className="flex items-center gap-2">
            <input readOnly value={fresh} aria-label="Token novo" onFocus={(e) => e.currentTarget.select()} className="field !text-[13px] font-mono" />
            <CopyButton value={fresh} />
            <button type="button" onClick={() => setFresh(null)} className="btn btn-ghost shrink-0">Fechar</button>
          </div>
        </div>
      )}

      {tokens.length === 0 ? (
        <p className="text-[13px] text-mt-muted">Nenhum token ativo.</p>
      ) : (
        <ul className="divide-y divide-mt-line rounded-[var(--radius-md)] border border-mt-line bg-mt-card">
          {tokens.map((t) => (
            <li key={t.id} className="flex items-center gap-3 px-3 py-2.5 text-[14px]">
              <div className="min-w-0 flex-1">
                <div className="truncate font-semibold text-mt-heading">{t.name}</div>
                <div className="truncate text-[13px] text-mt-muted">
                  Criado em {dateFmt.format(t.createdAt)} <span aria-hidden="true">//</span>{' '}
                  {t.lastUsedAt ? `usado em ${dateFmt.format(t.lastUsedAt)}` : 'nunca usado'}
                </div>
              </div>
              <button
                type="button"
                disabled={pending}
                className="btn btn-danger-ghost shrink-0"
                onClick={() => {
                  if (!window.confirm(`Revogar o token ${t.name}? Quem o usa perde o acesso.`)) return;
                  start(async () => {
                    const r = await revokeMcpTokenAction(t.id);
                    if ('error' in r) setError(r.error);
                    else {
                      setError(null);
                      router.refresh();
                    }
                  });
                }}
              >
                Revogar
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
