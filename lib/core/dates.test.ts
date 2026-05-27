import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { parseDate } from './dates';

const FIXED_NOW = new Date('2026-05-27T12:00:00Z').getTime(); // Wednesday

beforeAll(() => {
  vi.useFakeTimers();
  vi.setSystemTime(FIXED_NOW);
});
afterAll(() => vi.useRealTimers());

describe('parseDate', () => {
  it('parses ISO date', () => {
    expect(parseDate('2026-06-15')).toBe('2026-06-15');
  });
  it('parses "hoje"', () => {
    expect(parseDate('hoje')).toBe('2026-05-27');
  });
  it('parses "amanhã" and "amanha"', () => {
    expect(parseDate('amanhã')).toBe('2026-05-28');
    expect(parseDate('amanha')).toBe('2026-05-28');
  });
  it('parses "ontem"', () => {
    expect(parseDate('ontem')).toBe('2026-05-26');
  });
  it('parses "sex" (next Friday from a Wednesday)', () => {
    expect(parseDate('sex')).toBe('2026-05-29');
  });
  it('parses "sexta"', () => {
    expect(parseDate('sexta')).toBe('2026-05-29');
  });
  it('parses "+3d"', () => {
    expect(parseDate('+3d')).toBe('2026-05-30');
  });
  it('parses "+1s" and "+1sem" (1 week)', () => {
    expect(parseDate('+1s')).toBe('2026-06-03');
    expect(parseDate('+1sem')).toBe('2026-06-03');
  });
  it('parses "próxima sexta"', () => {
    expect(parseDate('próxima sexta')).toBe('2026-06-05');
  });
  it('parses "daqui 2 semanas"', () => {
    expect(parseDate('daqui 2 semanas')).toBe('2026-06-10');
  });
  it('throws INVALID_DATE on garbage', () => {
    expect(() => parseDate('zzz')).toThrow(/INVALID_DATE/);
  });
});
