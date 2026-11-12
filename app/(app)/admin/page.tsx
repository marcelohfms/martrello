import { getDb } from '@/lib/db/client';
import { requireAdmin } from '@/lib/auth/current-user';
import { listUsers } from '@/lib/auth/admin-users';
import { listPendingInvites } from '@/lib/auth/tokens';
import { listProjects } from '@/lib/core/projects';
import { listMembers } from '@/lib/core/members';
import { PeopleSection } from './PeopleSection';
import { ProjectMembersSection } from './ProjectMembersSection';

export default async function AdminPage() {
  const { user, actor } = await requireAdmin();
  const db = getDb();
  const [users, invites, projects] = await Promise.all([
    listUsers(db, actor),
    listPendingInvites(db, actor),
    listProjects(db, actor),
  ]);
  const projectRows = await Promise.all(
    projects.map(async (p) => ({
      id: p.id,
      name: p.name,
      acronym: p.acronym,
      color: p.color,
      members: await listMembers(db, actor, p.id),
    })),
  );

  return (
    <div className="h-dvh flex flex-col bg-mt-bg">
      <header className="flex h-14 shrink-0 items-center gap-2.5 border-b border-mt-line bg-mt-card pl-16 pr-4 md:px-6">
        <h1 className="text-[18px] font-bold tracking-[-0.02em] text-mt-heading">Admin</h1>
      </header>
      <div className="flex-1 overflow-y-auto px-4 py-6 md:px-6">
        <div className="mx-auto flex max-w-3xl flex-col gap-10">
          <PeopleSection
            currentUserId={user.id}
            users={users.map((u) => ({ id: u.id, name: u.name, email: u.email, role: u.role, disabled: u.disabledAt !== null, projectCount: u.projectCount }))}
            invites={invites.map((i) => ({ inviteId: i.inviteId, email: i.email, name: i.name, expiresAt: i.expiresAt }))}
          />
          <ProjectMembersSection
            projects={projectRows}
            people={users.filter((u) => u.disabledAt === null).map((u) => ({ id: u.id, name: u.name }))}
          />
        </div>
      </div>
    </div>
  );
}
