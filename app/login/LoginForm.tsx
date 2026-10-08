'use client';
import { useActionState } from 'react';
import { loginAction, type LoginState } from './actions';

const initial: LoginState = { error: null };

const inputClass = `
  w-full rounded-[4px] px-3 py-2 text-[14px]
  bg-[var(--color-mt-sidebar-hover)] text-[var(--color-mt-text)]
  border border-[var(--color-mt-line-subtle)]
  focus:outline-2 focus:outline-[var(--color-mt-accent)]
`;

export function LoginForm() {
  const [state, formAction, pending] = useActionState(loginAction, initial);

  return (
    <form action={formAction} className="w-full max-w-[320px] flex flex-col gap-4" aria-describedby="login-error">
      <h1 className="text-[20px] font-semibold tracking-tight text-[var(--color-mt-text)] select-none text-center mb-2">
        <span className="text-[var(--color-mt-accent)]">mar</span>trello
      </h1>

      <label className="flex flex-col gap-1.5 text-[12px] text-[var(--color-mt-muted-hi)]">
        Usuário
        <input name="username" autoComplete="username" required autoFocus className={inputClass} />
      </label>

      <label className="flex flex-col gap-1.5 text-[12px] text-[var(--color-mt-muted-hi)]">
        Senha
        <input name="password" type="password" autoComplete="current-password" required className={inputClass} />
      </label>

      <p id="login-error" role="alert" className="min-h-[18px] text-[12px] text-red-400">
        {state.error}
      </p>

      <button
        type="submit"
        disabled={pending}
        className="
          rounded-[4px] px-3 py-2 text-[14px] font-medium
          bg-[var(--color-mt-accent)] text-black
          hover:opacity-90 disabled:opacity-50
          transition-opacity duration-[120ms]
        "
      >
        {pending ? 'Entrando…' : 'Entrar'}
      </button>
    </form>
  );
}
