import type { EmailMessage } from './mailer';

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

type Content = Omit<EmailMessage, 'to'>;

export function inviteEmail(input: { name: string; link: string }): Content {
  return {
    subject: 'Convite para o Martrello',
    text: `Olá, ${input.name}!\n\nVocê foi convidado para o Martrello. Crie sua senha pelo link abaixo (vale por 7 dias):\n\n${input.link}\n`,
    html: `<p>Olá, ${esc(input.name)}!</p><p>Você foi convidado para o Martrello. Crie sua senha pelo link abaixo (vale por 7 dias):</p><p><a href="${esc(input.link)}">Criar minha senha</a></p>`,
  };
}

export function resetEmail(input: { link: string }): Content {
  return {
    subject: 'Redefinir sua senha do Martrello',
    text: `Recebemos um pedido para redefinir sua senha. Use o link abaixo (vale por 1 hora):\n\n${input.link}\n\nSe não foi você, ignore este e-mail.\n`,
    html: `<p>Recebemos um pedido para redefinir sua senha. Use o link abaixo (vale por 1 hora):</p><p><a href="${esc(input.link)}">Redefinir minha senha</a></p><p>Se não foi você, ignore este e-mail.</p>`,
  };
}
