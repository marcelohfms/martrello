// components/Sidebar.tsx
import Link from 'next/link';
import { getDb } from '@/lib/db/client';
import { listProjects } from '@/lib/core/projects';
import { getActiveSprintRow } from '@/lib/core/sprint';
import { SidebarClient } from './SidebarClient';

export async function Sidebar() {
  const projects = await listProjects(getDb());
  const activeSprint = await getActiveSprintRow(getDb());

  return (
    <SidebarClient
      projects={projects}
      sprintName={activeSprint?.name ?? null}
    />
  );
}
