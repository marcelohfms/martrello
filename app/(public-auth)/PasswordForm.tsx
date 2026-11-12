'use client';
import { useActionState } from 'react';
import type { FormState } from './messages';

const initial: FormState = { error: null };

export function PasswordForm({
  action,
  token,
  email,
  name,
  submitLabel,
  pendingLabel,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  token: string;
  email: string;
  name?: string | null;
  submitLabel: string;
  pendingLabel: string;
}) {
  const [state, formAction, pending] = useActionState(action, initial);
  return (
    <form action={formAction} aria-describedby="auth-error" className="flex flex-col gap-4">
      <input type="hidden" name="token" value={token} />
      <label className="flex flex-col gap-1.5 text-[13px] font-semibold text-mt-heading">
        E-mail
        <input type="email" value={email} readOnly autoComplete="username" className="field !text-[14px] font-normal opacity-70" />
      </label>
      {name != null && (
        <label className="flex flex-col gap-1.5 text-[13px] font-semibold text-mt-heading">
          Nome
          <input type="text" value={name} readOnly className="field !text-[14px] font-normal opacity-70" />
        </label>
      )}
      <label className="flex flex-col gap-1.5 text-[13px] font-semibold text-mt-heading">
        Senha
        <input name="password" type="password" autoComplete="new-password" required minLength={12} autoFocus className="field !text-[14px] font-normal" />
      </label>
      <label className="flex flex-col gap-1.5 text-[13px] font-semibold text-mt-heading">
        Confirme a senha
        <input name="confirm" type="password" autoComplete="new-password" required minLength={12} className="field !text-[14px] font-normal" />
      </label>
      <p id="auth-error" role="alert" className="min-h-[20px] text-[13px] text-mt-danger">
        {state.error}
      </p>
      <button type="submit" disabled={pending} className="btn btn-primary !py-2.5 !text-[14px]">
        {pending ? pendingLabel : submitLabel}
      </button>
    </form>
  );
}
