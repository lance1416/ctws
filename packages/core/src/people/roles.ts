/**
 * The role a person is placed by (DES-001, search rows): of the roles with no end, the one that
 * began first; a role with no known start comes after those with one, then the person's own order.
 * Null when every role has ended.
 */
export function currentRole<R extends { from: string | null; to: string | null }>(
  roles: readonly R[],
): R | null {
  const current = roles.filter((r) => r.to === null)
  const started = current
    .filter((r) => r.from !== null)
    .sort((a, b) => a.from!.localeCompare(b.from!))
  return started[0] ?? current[0] ?? null
}
