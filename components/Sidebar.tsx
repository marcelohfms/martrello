// components/Sidebar.tsx
import Link from 'next/link';
import { getDb } from '@/lib/db/client';
import { requireActor } from '@/lib/auth/current-user';
import { listProjects } from '@/lib/core/projects';
import { ensureCurrentSprint } from '@/lib/core/sprint';
import { SidebarClient } from './SidebarClient';

export async function Sidebar() {
  const { user, actor } = await requireActor();
  const projects = await listProjects(getDb(), actor);
  const sprint = await ensureCurrentSprint(getDb(), user.id);

  return (
    <SidebarClient
      projects={projects}
      sprintName={sprint.name}
    />
  );
}
