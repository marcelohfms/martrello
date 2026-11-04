import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/current-user';
import { LoginForm } from './LoginForm';

export default async function LoginPage() {
  if (await getCurrentUser()) redirect('/');
  return (
    <main
      className="relative flex min-h-dvh flex-1 items-center justify-center bg-mt-rail bg-cover bg-center px-4"
      style={{ backgroundImage: 'url(/brand/bg-gradient-dark.webp)' }}
    >
      <div
        className="pointer-events-none absolute inset-0 bg-cover bg-center opacity-30"
        style={{ backgroundImage: 'url(/brand/bg-grid-dark.webp)' }}
        aria-hidden="true"
      />
      <LoginForm />
    </main>
  );
}
