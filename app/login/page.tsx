import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/current-user';
import { LoginForm } from './LoginForm';

export default async function LoginPage() {
  if (await getCurrentUser()) redirect('/');
  return (
    <main className="flex-1 min-h-dvh flex items-center justify-center px-4 bg-[var(--color-mt-sidebar-bg)]">
      <LoginForm />
    </main>
  );
}
