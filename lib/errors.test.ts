import { describe, it, expect } from 'vitest';
import { MartrelloError, suggestClosest } from './errors';

describe('MartrelloError', () => {
  it('serializes to {error, message}', () => {
    const e = new MartrelloError('PROJECT_NOT_FOUND', "Projeto 'foo' não existe");
    expect(e.toJSON()).toEqual({
      error: 'PROJECT_NOT_FOUND',
      message: "Projeto 'foo' não existe",
    });
  });

  it('includes suggestions when provided', () => {
    const e = new MartrelloError('PROJECT_NOT_FOUND', 'msg', ['martrello', 'app']);
    expect(e.toJSON()).toEqual({
      error: 'PROJECT_NOT_FOUND',
      message: 'msg',
      suggestions: ['martrello', 'app'],
    });
  });
});

describe('suggestClosest', () => {
  it('returns up to 3 closest names by Levenshtein distance', () => {
    const out = suggestClosest('mart', ['martrello', 'pessoal', 'martelo', 'app']);
    expect(out).toEqual(['martelo', 'martrello']);
  });

  it('returns empty when no candidate is close enough', () => {
    const out = suggestClosest('xyz', ['martrello', 'pessoal']);
    expect(out).toEqual([]);
  });
});
