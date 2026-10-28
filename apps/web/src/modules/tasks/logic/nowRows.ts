/** Rows Ready to start keeps for itself however much is in progress (FR-078). */
const READY_KEEPS = 2

/**
 * How Now's rows are shared (FR-078): what is in progress first, as many as fit while Ready to
 * start keeps two rows, or as many as it has when that is fewer; Ready to start has the rest.
 */
export function nowRows(
  rows: number,
  inProgress: number,
  ready: number,
): { inProgress: number; ready: number } {
  const kept = Math.min(READY_KEEPS, ready)
  const working = Math.min(inProgress, Math.max(0, rows - kept))
  return { inProgress: working, ready: Math.min(ready, Math.max(0, rows - working)) }
}
