/** "Blocked by “<task>” and 2 more": names the first blocker and counts the rest. */
export function blockedLabel(
  blockers: readonly { id: string; title: string }[] | undefined,
): string | null {
  if (!blockers || blockers.length === 0) return null
  const [first, ...rest] = blockers
  return rest.length === 0
    ? `Blocked by “${first!.title}”`
    : `Blocked by “${first!.title}” and ${blockers.length - 1} more`
}
