'use client';

export type Member = { id: string; name: string; email: string; disabled: boolean };
export type CurrentAssignee = { name: string; email: string; disabled: boolean };

type Props = {
  members: Member[];
  /** The card's current assignee, or null. */
  current: CurrentAssignee | null;
  /** "Sem responsável" is only offered in Backlog. */
  allowNone: boolean;
  disabled?: boolean;
  onChange: (assignee: string | null) => void;
};

export function AssigneePicker({ members, current, allowNone, disabled, onChange }: Props) {
  // Only active members can be picked.
  const options = members.filter((m) => !m.disabled);
  // An assignee who left the project (or was deactivated) still shows as the selected value,
  // so the select never falls back to the first option.
  const outside = current && !options.some((m) => m.email === current.email) ? current : null;
  const value = current?.email ?? null;
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
      {outside && (
        <option value={outside.email} disabled>
          {outside.name} ({outside.disabled ? 'desativado' : 'fora do projeto'})
        </option>
      )}
      {options.map((m) => (
        <option key={m.id} value={m.email}>{m.name}</option>
      ))}
    </select>
  );
}
