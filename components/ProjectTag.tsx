// components/ProjectTag.tsx
type Props = {
  acronym: string;
  color?: string;
  /** Real project name, only passed when the privacy toggle is revealed. */
  name?: string;
};

export function ProjectTag({ acronym, color, name }: Props) {
  const tint = color ?? 'var(--color-ax-greige-400)';
  return (
    <span
      title={name}
      className="inline-flex min-w-[3.25rem] shrink-0 items-center justify-center gap-1.5 rounded-full px-2 py-0.5 text-[10.5px] font-bold tracking-[0.08em] text-mt-heading"
      style={{ background: `color-mix(in srgb, ${tint} 16%, white)` }}
    >
      <span
        className="size-1.5 shrink-0 rounded-full"
        style={{ background: tint }}
        aria-hidden="true"
      />
      {acronym}
    </span>
  );
}
