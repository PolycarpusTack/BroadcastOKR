/** A new Set with `key` added when absent, removed when present (for toggle-style state). */
export function toggleInSet<T>(set: ReadonlySet<T>, key: T): Set<T> {
  const next = new Set(set);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  return next;
}

/** A new array with `item` appended when absent, removed when present. */
export function toggleInArray<T>(items: readonly T[], item: T): T[] {
  return items.includes(item) ? items.filter((x) => x !== item) : [...items, item];
}
