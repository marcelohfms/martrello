'use client';
import { useRef, useState, useTransition } from 'react';
import { changePasswordAction } from './actions';

export function PasswordSection() {
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const current = String(fd.get('current') ?? '');
    const next = String(fd.get('next') ?? '');
    const confirm = String(fd.get('confirm') ?? '');
    start(async () => {
      const r = await changePasswordAction(current, next, confirm);
      if ('error' in r) {
        setError(r.error);
        setDone(false);
        return;
      }
      setError(null);
      setDone(true);
      formRef.current?.reset();
    });
  }

  return (
    <section aria-labelledby="password-h" className="flex flex-col gap-4">
      <h2 id="password-h" className="text-[16px] font-bold tracking-[-0.01em] text-mt-heading">Senha</h2>
      <p className="text-[13px] text-mt-muted">Ao trocar a senha, as outras sessões abertas são encerradas.</p>
      <form ref={formRef} onSubmit={submit} className="flex max-w-sm flex-col gap-4">
        <label className="flex flex-col gap-1.5 text-[13px] font-semibold text-mt-heading">
          Senha atual
          <input name="current" type="password" autoComplete="current-password" required className="field !text-[14px] font-normal" />
        </label>
        <label className="flex flex-col gap-1.5 text-[13px] font-semibold text-mt-heading">
          Senha nova
          <input name="next" type="password" autoComplete="new-password" required minLength={12} className="field !text-[14px] font-normal" />
        </label>
        <label className="flex flex-col gap-1.5 text-[13px] font-semibold text-mt-heading">
          Confirme a senha nova
          <input name="confirm" type="password" autoComplete="new-password" required minLength={12} className="field !text-[14px] font-normal" />
        </label>
        <p role="alert" className="min-h-[20px] text-[13px] text-mt-danger">{error}</p>
        {done && <p role="status" className="text-[13px] text-mt-muted">Senha alterada.</p>}
        <button type="submit" disabled={pending} className="btn btn-primary !py-2.5 self-start">
          {pending ? 'Salvando' : 'Trocar senha'}
        </button>
      </form>
    </section>
  );
}
