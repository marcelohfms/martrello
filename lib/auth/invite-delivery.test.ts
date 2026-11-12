import { beforeEach, describe, expect, it, vi } from 'vitest';

const appUrlMock = vi.fn((p: string) => 'https://app.test' + p);
vi.mock('@/lib/email/mailer', () => ({
  sendEmail: vi.fn(),
  appUrl: (p: string) => appUrlMock(p),
}));

import { sendEmail } from '@/lib/email/mailer';
import { deliverInvite, inviteLinkPreflight, SEND_WARNING } from './invite-delivery';

const send = vi.mocked(sendEmail);

describe('deliverInvite', () => {
  beforeEach(() => {
    send.mockReset();
    appUrlMock.mockClear();
  });

  it('sent: ok without a link', async () => {
    send.mockResolvedValue('sent');
    expect(await deliverInvite('a@b.c', 'Ana', 'tok')).toEqual({ ok: true });
    expect(send.mock.calls[0][0].to).toBe('a@b.c');
  });
  it('disabled: ok with the link', async () => {
    send.mockResolvedValue('disabled');
    expect(await deliverInvite('a@b.c', 'Ana', 'tok')).toEqual({ ok: true, link: 'https://app.test/convite/tok' });
  });
  it('throw: ok with link and warning', async () => {
    send.mockImplementationOnce(() => { throw new Error('Resend 500'); });
    const r = await deliverInvite('a@b.c', 'Ana', 'tok');
    expect(r).toEqual({
      ok: true,
      link: 'https://app.test/convite/tok',
      warning: SEND_WARNING,
    });
  });
  it('sem APP_URL: devolve erro e não envia', async () => {
    appUrlMock.mockImplementation(() => { throw new Error('APP_URL não configurada'); });
    expect(inviteLinkPreflight()).toEqual({ error: 'APP_URL não configurada' });
    expect(await deliverInvite('a@b.c', 'Ana', 'tok')).toEqual({ error: 'APP_URL não configurada' });
    expect(send).not.toHaveBeenCalled();
    appUrlMock.mockImplementation((p: string) => 'https://app.test' + p);
    expect(inviteLinkPreflight()).toBeNull();
  });
});
