// app/page.tsx
import { redirect } from 'next/navigation';
import { getDb } from '@/lib/db/client';
import { listProjects } from '@/lib/core/projects';

export default async function Home() {
  const projects = await listProjects(getDb());
  if (projects[0]) redirect(`/project/${projects[0].id}`);
  redirect('/sprint');
}
