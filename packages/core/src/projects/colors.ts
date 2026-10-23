import { projectColors, type ProjectColor } from '@ctws/contracts'

/**
 * The colour a new project gets (FR-052): one not yet used; once all eight are, the least used,
 * earliest in the list. `taken` is every project's, archived ones and the inbox included.
 */
export function leastUsedColor(taken: readonly ProjectColor[]): ProjectColor {
  const count = new Map<ProjectColor, number>(projectColors.map((c) => [c, 0]))
  for (const c of taken) count.set(c, (count.get(c) ?? 0) + 1)
  return [...projectColors].sort((a, b) => count.get(a)! - count.get(b)!)[0]!
}
