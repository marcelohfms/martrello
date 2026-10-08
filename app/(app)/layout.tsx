// app/(app)/layout.tsx
import { Sidebar } from '@/components/Sidebar';
import { ProjectPrivacyProvider } from '@/components/ProjectPrivacyContext';
import { requireUser } from '@/lib/auth/current-user';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  await requireUser();
  return (
    <>
      {/* a11y: skip to main content */}
      <a href="#main-content" className="skip-link">
        Pular para conteúdo principal
      </a>
      <ProjectPrivacyProvider>
        <Sidebar />
        <main id="main-content" className="flex-1 min-w-0">
          {children}
        </main>
      </ProjectPrivacyProvider>
    </>
  );
}
