import type { RollupResponse } from '@ctws/contracts'

/**
 * "60% · 2 in progress · 1 overdue" -- a parent row's subtree, in words.
 *
 * THE PERCENTAGE ALONE DOES NOT ANSWER “Movement”, which is why this is a line of words and not
 * a bar. Each part is dropped when it has nothing to say, so a parent whose
 * children are merely unstarted gets "0%" and no tail, rather than a row of zeroes.
 *
 * `null` when there is nothing worth a second line -- and A LONE "0%" COUNTS AS NOTHING.
 *
 * That exception is the whole reason this is a function and not a template. Every task starts on
 * `todo`, so every parent has a progress number, and without it every parent in the tree would
 * grow a second line reading "0%": a 14px tax on half the rows to say what the children listed
 * underneath already say. A 0 that comes with "2 in progress" or "1 overdue" keeps its place --
 * there it is context for a number that does mean something.
 */
export function rollupPhrase(r: RollupResponse | undefined): string | null {
  if (!r) return null
  const parts: string[] = []
  if (r.progress !== null) parts.push(`${Math.round(r.progress * 100)}%`)
  if (r.counts.in_progress > 0) parts.push(`${r.counts.in_progress} in progress`)
  if (r.overdue > 0) parts.push(`${r.overdue} overdue`)
  if (parts.length === 1 && r.progress === 0) return null
  // `dueSoon` is deliberately NOT here. It is in the rollup because the project banner and a
  // future board can use it, but on a row it would be a fourth number competing with the row's
  // own deadline, which is already shown exactly and to the minute.
  return parts.length > 0 ? parts.join(' · ') : null
}
