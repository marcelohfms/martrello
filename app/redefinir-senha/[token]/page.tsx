import { getDb } from '@/lib/db/client';
import { peekToken } from '@/lib/auth/tokens';
import { AuthShell, BackToLogin } from '@/app/(public-auth)/AuthShell';
import { PasswordForm } from '@/app/(public-auth)/PasswordForm';
import { resetPasswordAction } from '@/app/(public-auth)/actions';
import { TOKEN_INVALID_MESSAGE } from '@/app/(public-auth)/messages';

export const dynamic = 'force-dynamic';

export default async function ResetPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const info = await peekToken(getDb(), 'reset', token);
  return (
    <AuthShell>
      {info ? (
        <>
          <h1 className="text-[16px] font-bold text-mt-heading">Criar senha nova</h1>
          <PasswordForm
            action={resetPasswordAction}
            token={token}
            email={info.email}
            submitLabel="Redefinir senha"
            pendingLabel="Salvando…"
          />
        </>
      ) : (
        <>
          <p role="alert" className="text-[14px] text-mt-heading">{TOKEN_INVALID_MESSAGE}</p>
          <BackToLogin />
        </>
      )}
    </AuthShell>
  );
}
