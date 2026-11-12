export const TOKEN_NAME_MESSAGE = 'Dê um nome ao token (até 60 caracteres).';

export function validateInviteInput(input: { name: string; email: string }):
  | { ok: true; name: string; email: string }
  | { error: string } {
  const name = input.name.trim();
  const email = input.email.trim();
  if (name.length < 1 || name.length > 80) return { error: 'Informe o nome (até 80 caracteres).' };
  if (!email.includes('@')) return { error: 'Informe um e-mail válido.' };
  return { ok: true, name, email };
}

export function validateTokenName(raw: string): { ok: true; name: string } | { error: string } {
  const name = raw.trim();
  if (name.length < 1 || name.length > 60) return { error: TOKEN_NAME_MESSAGE };
  return { ok: true, name };
}

export function validatePasswordChange(
  _current: string,
  next: string,
  confirm: string,
): { ok: true } | { error: string } {
  if (next !== confirm) return { error: 'As senhas não conferem.' };
  return { ok: true };
}
