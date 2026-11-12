import { describe, it, expect } from 'vitest';
import { inviteEmail, resetEmail } from './templates';

describe('templates', () => {
  it('assuntos fixos', () => {
    expect(inviteEmail({ name: 'Ana', link: 'https://x/y' }).subject).toBe('Convite para o Martrello');
    expect(resetEmail({ link: 'https://x/y' }).subject).toBe('Redefinir sua senha do Martrello');
  });
  it('sem exclamações e com o link', () => {
    for (const m of [inviteEmail({ name: 'Ana', link: 'https://x/y' }), resetEmail({ link: 'https://x/y' })]) {
      expect(m.text).not.toContain('!');
      expect(m.html).not.toContain('!');
      expect(m.text).toContain('https://x/y');
    }
  });
});
