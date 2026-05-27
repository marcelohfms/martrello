import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { todayISO, tomorrowISO, nextWeekISO, nextMonthISO } from './date-shortcuts';

// Wednesday, 2026-05-27 (matches dates.test.ts)
const FIXED_NOW = new Date('2026-05-27T12:00:00Z').getTime();

beforeAll(() => { vi.useFakeTimers(); vi.setSystemTime(FIXED_NOW); });
afterAll(() => vi.useRealTimers());

describe('date-shortcuts', () => {
  it('todayISO returns today in YYYY-MM-DD', () => {
    expect(todayISO()).toBe('2026-05-27');
  });

  it('tomorrowISO returns tomorrow', () => {
    expect(tomorrowISO()).toBe('2026-05-28');
  });

  it('nextWeekISO returns same weekday next week (+7d)', () => {
    expect(nextWeekISO()).toBe('2026-06-03');
  });

  it('nextMonthISO returns same day-of-month next month', () => {
    expect(nextMonthISO()).toBe('2026-06-27');
  });

  it('nextMonthISO clamps to last valid day (May 31 → Jun 30)', () => {
    const may31 = new Date('2026-05-31T12:00:00Z');
    expect(nextMonthISO(may31)).toBe('2026-06-30');
  });

  it('nextMonthISO clamps to last valid day (Jan 31 → Feb 28 in 2026)', () => {
    const jan31 = new Date('2026-01-31T12:00:00Z');
    expect(nextMonthISO(jan31)).toBe('2026-02-28');
  });

  it('nextMonthISO clamps to last valid day (Mar 31 → Apr 30)', () => {
    const mar31 = new Date('2026-03-31T12:00:00Z');
    expect(nextMonthISO(mar31)).toBe('2026-04-30');
  });

  it('nextMonthISO does not clamp when day exists in target month', () => {
    const jan15 = new Date('2026-01-15T12:00:00Z');
    expect(nextMonthISO(jan15)).toBe('2026-02-15');
  });

  it('accepts explicit `now` for testability', () => {
    const custom = new Date('2026-12-25T12:00:00Z');
    expect(todayISO(custom)).toBe('2026-12-25');
    expect(tomorrowISO(custom)).toBe('2026-12-26');
    expect(nextWeekISO(custom)).toBe('2027-01-01');
  });
});
