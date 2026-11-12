'use client';
import { useProjectPrivacy } from './ProjectPrivacyContext';

/** Project name that respects the privacy toggle: acronym unless revealed. */
export function ProjectLabel({ name, acronym, color }: { name: string; acronym: string; color: string }) {
  const { revealed } = useProjectPrivacy();
  return (
    <span className="flex min-w-0 items-center gap-2">
      <span className="size-2.5 shrink-0 rounded-full" style={{ background: color }} aria-hidden="true" />
      <span className="truncate font-semibold text-mt-heading">{revealed ? name : acronym}</span>
    </span>
  );
}
