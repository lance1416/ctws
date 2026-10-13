/** A nullable instant as the wire's ISO string. */
export const isoOrNull = (d: Date | null): string | null => (d ? d.toISOString() : null)

/** Items grouped by key, each group in input order. */
export function groupBy<T, K, V>(
  items: readonly T[],
  key: (item: T) => K,
  value: (item: T) => V,
): Map<K, V[]> {
  const groups = new Map<K, V[]>()
  for (const item of items) {
    const group = groups.get(key(item))
    if (group) group.push(value(item))
    else groups.set(key(item), [value(item)])
  }
  return groups
}
