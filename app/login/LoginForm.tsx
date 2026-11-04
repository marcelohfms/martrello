'use client';
import { useActionState } from 'react';
import { loginAction, type LoginState } from './actions';

const initial: LoginState = { error: null };

export function LoginForm() {
  const [state, formAction, pending] = useActionState(loginAction, initial);

  return (
    <form
      action={formAction}
      aria-describedby="login-error"
      className="relative flex w-full max-w-[360px] flex-col gap-4 rounded-[var(--radius-lg)] bg-mt-card p-8 shadow-raised"
    >
      <div className="mb-2 flex items-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/mark-green.png" alt="" width={20} height={31} />
        <h1 className="select-none text-[24px] font-extrabold tracking-[-0.02em] text-mt-heading">martrello</h1>
      </div>

      <label className="flex flex-col gap-1.5 text-[13px] font-semibold text-mt-heading">
        Usuário
        <input name="username" autoComplete="username" required autoFocus className="field !text-[14px] font-normal" />
      </label>

      <label className="flex flex-col gap-1.5 text-[13px] font-semibold text-mt-heading">
        Senha
        <input name="password" type="password" autoComplete="current-password" required className="field !text-[14px] font-normal" />
      </label>

      <p id="login-error" role="alert" className="min-h-[20px] text-[13px] text-mt-danger">
        {state.error}
      </p>

      <button type="submit" disabled={pending} className="btn btn-primary !py-2.5 !text-[14px]">
        {pending ? 'Entrando…' : 'Entrar'}
      </button>
    </form>
  );
}
