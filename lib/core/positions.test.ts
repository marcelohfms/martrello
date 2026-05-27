import { describe, it, expect } from 'vitest';
import { renumber, insertAt, POSITION_STEP } from './positions';

describe('renumber', () => {
  it('returns evenly-spaced integers starting at STEP', () => {
    expect(renumber(['a', 'b', 'c'])).toEqual([
      { id: 'a', position: POSITION_STEP * 1 },
      { id: 'b', position: POSITION_STEP * 2 },
      { id: 'c', position: POSITION_STEP * 3 },
    ]);
  });
  it('handles empty', () => {
    expect(renumber([])).toEqual([]);
  });
});

describe('insertAt', () => {
  it('appends when index >= length', () => {
    const ordered = [{ id: 'a' }, { id: 'b' }];
    expect(insertAt(ordered, 'new', 99).map((x) => x.id)).toEqual(['a', 'b', 'new']);
  });
  it('inserts at given index', () => {
    const ordered = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    expect(insertAt(ordered, 'new', 1).map((x) => x.id)).toEqual(['a', 'new', 'b', 'c']);
  });
  it('moves existing id when present', () => {
    const ordered = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    expect(insertAt(ordered, 'a', 2).map((x) => x.id)).toEqual(['b', 'a', 'c']);
  });
});
