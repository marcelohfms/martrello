// lib/core/acronym.test.ts
import { describe, it, expect } from 'vitest';
import { suggestAcronym } from './acronym';

describe('suggestAcronym', () => {
  it('samples first+middle+last letter for a single word with no separators or camelCase', () => {
    expect(suggestAcronym('Nubank')).toBe('NBK');
    expect(suggestAcronym('Berzerk')).toBe('BZK');
    expect(suggestAcronym('Motim')).toBe('MTM');
    expect(suggestAcronym('Villela')).toBe('VLA');
    expect(suggestAcronym('Axivero')).toBe('AVO');
  });

  it('uses initials of both words + last letter of the whole name for 2-word names (space or hyphen separated)', () => {
    expect(suggestAcronym('Edu-TO')).toBe('ETO');
    expect(suggestAcronym('Aulas Walter')).toBe('AWR');
    expect(suggestAcronym('Aulas Mayk')).toBe('AMK');
  });

  it('does NOT further split an already-2-chunk (space/hyphen separated) name by internal camelCase', () => {
    // "DascIA" has an internal lowercase->uppercase transition (c->I), but
    // because "Aulas DascIA" is already 2 space-separated chunks, that
    // transition must be ignored — the result must stay a 2-word case.
    expect(suggestAcronym('Aulas DascIA')).toBe('ADA');
  });

  it('splits camelCase within a single unspaced/unhyphenated word into 2 words', () => {
    expect(suggestAcronym('TotalPass')).toBe('TPS');
  });

  it('uses the first letter of each of the first 3 words for 3+ word names', () => {
    expect(suggestAcronym('Never Say never')).toBe('NSN');
  });

  it('does not throw and still returns a 3-character result for very short names', () => {
    expect(suggestAcronym('A')).toHaveLength(3);
    expect(suggestAcronym('Ab')).toHaveLength(3);
  });

  it('two different names can legitimately collide on the same suggested acronym (uniqueness is enforced elsewhere, not by this function)', () => {
    // Both are 5 letters, same letter at index 0, 2 (middle), and 4 (last).
    expect(suggestAcronym('Lemon')).toBe('LMN');
    expect(suggestAcronym('Lumon')).toBe('LMN');
  });
});
