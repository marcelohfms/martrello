import { describe, it, expect } from 'vitest';
import { weekStartISO, weekBounds, sprintName } from './week';

describe('week', () => {
  it('a semana vira à meia-noite de segunda em São Paulo', () => {
    expect(weekStartISO(new Date('2026-11-16T02:59:00Z'))).toBe('2026-11-09'); // domingo 23:59 em SP
    expect(weekStartISO(new Date('2026-11-16T03:00:00Z'))).toBe('2026-11-16'); // segunda 00:00 em SP
  });

  it('qualquer dia da semana cai na segunda-feira dela', () => {
    expect(weekStartISO(new Date('2026-11-18T15:00:00Z'))).toBe('2026-11-16'); // quarta
    expect(weekStartISO(new Date('2026-11-22T23:00:00Z'))).toBe('2026-11-16'); // domingo 20:00 em SP
    expect(weekStartISO(new Date('2027-01-01T12:00:00Z'))).toBe('2026-12-28'); // vira o ano
  });

  it('weekBounds vai da meia-noite de segunda à da segunda seguinte em São Paulo', () => {
    expect(weekBounds('2026-11-16')).toEqual({
      startMs: Date.parse('2026-11-16T03:00:00Z'),
      endMs: Date.parse('2026-11-23T03:00:00Z'),
    });
  });

  it('sprintName usa dia/mês da segunda-feira', () => {
    expect(sprintName('2026-11-16')).toBe('Semana 16/11');
    expect(sprintName('2026-02-02')).toBe('Semana 02/02');
  });
});
