import { describe, it, expect } from 'vitest';
import { easterSunday, nationalHolidays, isBusinessDay, isFirstBusinessDayOfWeek } from './holidays';

describe('holidays', () => {
  it('easterSunday', () => {
    expect(easterSunday(2025)).toBe('2025-04-20');
    expect(easterSunday(2026)).toBe('2026-04-05');
    expect(easterSunday(2027)).toBe('2027-03-28');
  });

  it('feriados móveis de 2026', () => {
    const h = nationalHolidays(2026);
    for (const d of ['2026-02-16', '2026-02-17', '2026-04-03', '2026-06-04']) expect(h.has(d)).toBe(true);
    expect(h.has('2026-02-18')).toBe(false); // Cinzas
  });

  it('feriados fixos', () => {
    const h = nationalHolidays(2026);
    for (const d of ['2026-01-01', '2026-04-21', '2026-05-01', '2026-09-07', '2026-10-12', '2026-11-02', '2026-11-15', '2026-11-20', '2026-12-25']) {
      expect(h.has(d)).toBe(true);
    }
  });

  it('isBusinessDay', () => {
    expect(isBusinessDay('2026-11-16')).toBe(true); // segunda comum
    expect(isBusinessDay('2026-11-14')).toBe(false); // sábado
    expect(isBusinessDay('2026-11-20')).toBe(false); // Consciência Negra
    expect(isBusinessDay('2026-02-18')).toBe(true); // Cinzas
  });

  it('isFirstBusinessDayOfWeek', () => {
    expect(isFirstBusinessDayOfWeek('2026-11-16')).toBe(true);
    expect(isFirstBusinessDayOfWeek('2026-11-17')).toBe(false);
    expect(isFirstBusinessDayOfWeek('2026-11-03')).toBe(true); // segunda 02/11 é Finados
    expect(isFirstBusinessDayOfWeek('2026-02-18')).toBe(true); // seg e ter de Carnaval
    expect(isFirstBusinessDayOfWeek('2026-11-14')).toBe(false); // sábado
  });
});
