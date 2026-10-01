// lib/core/acronym.ts

function splitChunks(name: string): string[] {
  return name.split(/[\s\-_]+/).filter(Boolean);
}

function splitCamel(chunk: string): string[] {
  return chunk.split(/(?<=[a-z0-9])(?=[A-Z])/).filter(Boolean);
}

export function suggestAcronym(name: string): string {
  const alnum = name.replace(/[^a-zA-Z0-9]/g, '');
  if (alnum.length === 0) return '???';

  let words = splitChunks(name);
  // Only probe for camelCase word boundaries when there was no explicit
  // space/hyphen/underscore separator at all — a name that's already split
  // into 2+ chunks (e.g. "Aulas DascIA") is never split further, even if
  // one of its chunks happens to contain an internal case transition.
  if (words.length === 1) {
    const camelSplit = splitCamel(words[0]);
    if (camelSplit.length > 1) words = camelSplit;
  }

  if (words.length >= 3) {
    return words.slice(0, 3).map((w) => w[0]).join('').toUpperCase();
  }
  if (words.length === 2) {
    const initials = words.map((w) => w[0]).join('');
    const lastChar = alnum[alnum.length - 1];
    return (initials + lastChar).toUpperCase();
  }

  // Single word: sample the first, middle, and last letter.
  const len = alnum.length;
  const first = alnum[0];
  const mid = alnum[Math.floor((len - 1) / 2)];
  const last = alnum[len - 1];
  return (first + mid + last).toUpperCase();
}
