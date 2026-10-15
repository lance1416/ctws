/**
 * "Blocked by “<task>”" -- what a row waits for, in one phrase. Names the first and counts the
 * rest: the usual case is one, and naming it answers the question without opening the pane.
 */
export function blockedLabel(
  blockers: readonly { id: string; title: string }[] | undefined,
): string | null {
  if (!blockers || blockers.length === 0) return null
  const [first, ...rest] = blockers
  return rest.length === 0
    ? `Blocked by “${first!.title}”`
    : `Blocked by “${first!.title}” and ${blockers.length - 1} more`
}
