'use client';
// components/ProjectHeaderName.tsx
import { useProjectPrivacy } from './ProjectPrivacyContext';

export function ProjectHeaderName({ name, acronym }: { name: string; acronym: string }) {
  const { revealed } = useProjectPrivacy();
  return (
    <h1 className="text-[14px] font-semibold text-[var(--color-mt-text)] truncate">
      {revealed ? name : acronym}
    </h1>
  );
}
