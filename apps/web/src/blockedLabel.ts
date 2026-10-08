/**
 * 「被「跑通 CI」挡着」 — what a row is waiting for, in one phrase (D64).
 *
 * NAMES THE FIRST ONE, counts the rest. A row that simply said 「被 3 件事挡着」 would send the
 * reader into the detail pane to learn anything at all, and the usual case is one blocker, where
 * naming it answers the question on the spot. The pane has the full list.
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
