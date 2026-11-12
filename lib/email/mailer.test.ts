import { describe, it, expect, vi, afterEach } from 'vitest';
import { sendEmail, appUrl } from './mailer';

const msg = { to: 'a@t.local', subject: 'Oi', text: 'texto', html: '<p>texto</p>' };

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('sendEmail', () => {
  it('sem RESEND_API_KEY devolve disabled e não chama fetch', async () => {
    vi.stubEnv('RESEND_API_KEY', '');
    const f = vi.fn();
    vi.stubGlobal('fetch', f);
    expect(await sendEmail(msg)).toBe('disabled');
    expect(f).not.toHaveBeenCalled();
  });

  it('monta o POST do Resend', async () => {
    vi.stubEnv('RESEND_API_KEY', 're_test');
    vi.stubEnv('EMAIL_FROM', 'Martrello <no-reply@t.local>');
    const f = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', f);
    expect(await sendEmail(msg)).toBe('sent');
    const [url, init] = f.mock.calls[0];
    expect(url).toBe('https://api.resend.com/emails');
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe('Bearer re_test');
    expect(init.headers['Content-Type']).toBe('application/json');
    expect(JSON.parse(init.body)).toEqual({
      from: 'Martrello <no-reply@t.local>', to: ['a@t.local'], subject: 'Oi', text: 'texto', html: '<p>texto</p>',
    });
  });

  it('resposta não-2xx lança erro com o status', async () => {
    vi.stubEnv('RESEND_API_KEY', 're_test');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('boom', { status: 422 })));
    await expect(sendEmail(msg)).rejects.toThrow(/422/);
  });
});

describe('appUrl', () => {
  it('junta APP_URL sem barra final com o caminho', () => {
    vi.stubEnv('APP_URL', 'https://m.example.com/');
    expect(appUrl('/convite/abc')).toBe('https://m.example.com/convite/abc');
  });
});
