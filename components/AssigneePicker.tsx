'use client';

export type Member = { id: string; name: string; email: string; disabled: boolean };

type Props = {
  members: Member[];
  /** Current assignee's email, or null. */
  value: string | null;
  /** "Sem responsável" is only offered in Backlog. */
  allowNone: boolean;
  disabled?: boolean;
  onChange: (assignee: string | null) => void;
};

export function AssigneePicker({ members, value, allowNone, disabled, onChange }: Props) {
  // Active members only; a disabled current assignee stays listed so the value still shows.
  const options = members.filter((m) => !m.disabled || m.email === value);
  return (
    <select
      value={value ?? ''}
      disabled={disabled}
      aria-label="Responsável"
      onChange={(e) => onChange(e.target.value === '' ? null : e.target.value)}
      className="field cursor-pointer"
    >
      {allowNone && <option value="">Sem responsável</option>}
      {!allowNone && value === null && <option value="" disabled>Sem responsável</option>}
      {options.map((m) => (
        <option key={m.id} value={m.email} disabled={m.disabled}>
          {m.name}{m.disabled ? ' (desativado)' : ''}
        </option>
      ))}
    </select>
  );
}
