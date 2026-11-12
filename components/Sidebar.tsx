// components/Sidebar.tsx
import Link from 'next/link';
import { getDb } from '@/lib/db/client';
import { requireActor } from '@/lib/auth/current-user';
import { listProjects } from '@/lib/core/projects';
import { getActiveSprintRow } from '@/lib/core/sprint';
import { SidebarClient } from './SidebarClient';

export async function Sidebar() {
  const projects = await listProjects(getDb(), (await requireActor()).actor);
  const activeSprint = await getActiveSprintRow(getDb());

  return (
    <SidebarClient
      projects={projects}
      sprintName={activeSprint?.name ?? null}
    />
  );
}
