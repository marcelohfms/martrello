'use client';
// components/ProjectHeaderName.tsx
import { useProjectPrivacy } from './ProjectPrivacyContext';

export function ProjectHeaderName({ name, acronym }: { name: string; acronym: string }) {
  const { revealed } = useProjectPrivacy();
  return (
    <h1 className="truncate text-[18px] font-bold tracking-[-0.02em] text-mt-heading">
      {revealed ? name : acronym}
    </h1>
  );
}
