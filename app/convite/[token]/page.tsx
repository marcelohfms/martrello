import { getDb } from '@/lib/db/client';
import { peekToken } from '@/lib/auth/tokens';
import { AuthShell, BackToLogin } from '@/app/(public-auth)/AuthShell';
import { PasswordForm } from '@/app/(public-auth)/PasswordForm';
import { acceptInviteAction } from '@/app/(public-auth)/actions';
import { TOKEN_INVALID_MESSAGE } from '@/app/(public-auth)/messages';

export const dynamic = 'force-dynamic';

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const info = await peekToken(getDb(), 'invite', token);
  return (
    <AuthShell>
      {info ? (
        <>
          <h1 className="text-[16px] font-bold text-mt-heading">Crie sua senha</h1>
          <PasswordForm
            action={acceptInviteAction}
            token={token}
            email={info.email}
            name={info.name ?? ''}
            submitLabel="Criar conta"
            pendingLabel="Criando…"
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
