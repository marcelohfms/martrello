'use client';
import { useActionState } from 'react';
import { forgotPasswordAction } from './actions';
import type { FormState } from './messages';

const initial: FormState = { error: null };

export function ForgotForm() {
  const [state, formAction, pending] = useActionState(forgotPasswordAction, initial);
  return (
    <form action={formAction} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1.5 text-[13px] font-semibold text-mt-heading">
        E-mail
        <input name="email" type="email" autoComplete="username" required autoFocus className="field !text-[14px] font-normal" />
      </label>
      <p role="status" className="min-h-[20px] text-[13px] text-mt-heading">
        {state.message}
      </p>
      <button type="submit" disabled={pending} className="btn btn-primary !py-2.5 !text-[14px]">
        {pending ? 'Enviando…' : 'Enviar link'}
      </button>
    </form>
  );
}
