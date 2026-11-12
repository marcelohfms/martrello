import { AuthShell, BackToLogin } from '@/app/(public-auth)/AuthShell';
import { ForgotForm } from '@/app/(public-auth)/ForgotForm';

export default function ForgotPage() {
  return (
    <AuthShell>
      <h1 className="text-[16px] font-bold text-mt-heading">Esqueci minha senha</h1>
      <ForgotForm />
      <BackToLogin />
    </AuthShell>
  );
}
