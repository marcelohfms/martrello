export const POSITION_STEP = 1000;

export function renumber(ids: string[]): Array<{ id: string; position: number }> {
  return ids.map((id, i) => ({ id, position: POSITION_STEP * (i + 1) }));
}

export function insertAt<T extends { id: string }>(items: T[], id: string, index: number): T[] {
  const present = items.find((x) => x.id === id);
  const without = items.filter((x) => x.id !== id);
  const clampedIndex = Math.max(0, Math.min(index, without.length));
  const next = present ?? ({ id } as T);
  // If the item was present and is before the target index, adjust the index
  const originalIndex = items.findIndex((x) => x.id === id);
  const adjustedIndex = originalIndex >= 0 && originalIndex < index ? clampedIndex - 1 : clampedIndex;
  return [...without.slice(0, adjustedIndex), next, ...without.slice(adjustedIndex)];
}
