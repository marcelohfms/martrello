import { describe, expect, it } from 'vitest';
import { MartrelloError } from '@/lib/errors';
import { toResult } from './action-result';
import { validateInviteInput, validateTokenName, validatePasswordChange } from './auth/admin-input';

describe('toResult', () => {
  it('maps MartrelloError to its original message', () => {
    expect(toResult(new MartrelloError('FORBIDDEN', 'Sem acesso.'))).toEqual({ error: 'Sem acesso.' });
  });
  it('rethrows unknown errors', () => {
    expect(() => toResult(new Error('boom'))).toThrow('boom');
  });
});

describe('validateInviteInput', () => {
  it('trims name and email', () => {
    expect(validateInviteInput({ name: '  Ana  ', email: ' ana@x.com ' })).toEqual({ ok: true, name: 'Ana', email: 'ana@x.com' });
  });
  it('rejects empty and overlong names', () => {
    expect('error' in validateInviteInput({ name: '  ', email: 'a@b.c' })).toBe(true);
    expect('error' in validateInviteInput({ name: 'x'.repeat(81), email: 'a@b.c' })).toBe(true);
    expect('ok' in validateInviteInput({ name: 'x'.repeat(80), email: 'a@b.c' })).toBe(true);
  });
  it('rejects emails without @', () => {
    expect('error' in validateInviteInput({ name: 'Ana', email: 'ana.x.com' })).toBe(true);
  });
});

describe('validateTokenName', () => {
  it('accepts 1..60 trimmed', () => {
    expect(validateTokenName('  Meu Claude ')).toEqual({ ok: true, name: 'Meu Claude' });
    expect('ok' in validateTokenName('x'.repeat(60))).toBe(true);
  });
  it('rejects empty and overlong with the fixed message', () => {
    const msg = 'Dê um nome ao token (até 60 caracteres).';
    expect(validateTokenName('   ')).toEqual({ error: msg });
    expect(validateTokenName('x'.repeat(61))).toEqual({ error: msg });
  });
});

describe('validatePasswordChange', () => {
  it('rejects mismatch', () => {
    expect(validatePasswordChange('a', 'b', 'c')).toEqual({ error: 'As senhas não conferem.' });
  });
  it('accepts matching', () => {
    expect(validatePasswordChange('a', 'bbbb', 'bbbb')).toEqual({ ok: true });
  });
});
