// app/page.tsx
import { redirect } from 'next/navigation';
import { getDb } from '@/lib/db/client';
import { requireActor } from '@/lib/auth/current-user';
import { listProjects } from '@/lib/core/projects';

export default async function Home() {
  const projects = await listProjects(getDb(), (await requireActor()).actor);
  if (projects[0]) redirect(`/project/${projects[0].id}`);
  redirect('/sprint');
}
