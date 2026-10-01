'use client';
// components/ProjectPrivacyContext.tsx
import { createContext, useContext, useMemo, useState } from 'react';

type ProjectPrivacy = { revealed: boolean; toggle: () => void };

const ProjectPrivacyContext = createContext<ProjectPrivacy | null>(null);

export function ProjectPrivacyProvider({ children }: { children: React.ReactNode }) {
  // In-memory only, intentionally not persisted anywhere (localStorage,
  // cookie, URL, DB) — every full page reload must start hidden.
  const [revealed, setRevealed] = useState(false);
  const value = useMemo(
    () => ({ revealed, toggle: () => setRevealed((r) => !r) }),
    [revealed],
  );
  return (
    <ProjectPrivacyContext.Provider value={value}>
      {children}
    </ProjectPrivacyContext.Provider>
  );
}

export function useProjectPrivacy(): ProjectPrivacy {
  const ctx = useContext(ProjectPrivacyContext);
  if (!ctx) throw new Error('useProjectPrivacy must be used within ProjectPrivacyProvider');
  return ctx;
}
