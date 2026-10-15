import type { RollupResponse } from '@ctws/contracts'

/**
 * "60% · 2 in progress · 1 overdue" -- a parent row's subtree, in words, each part dropped when it
 * has nothing to say. A LONE "0%" IS NOTHING (null): a second line saying only that would tax every
 * unstarted parent to repeat what its children show. Beside "2 in progress" a 0 is context.
 */
export function rollupPhrase(r: RollupResponse | undefined): string | null {
  if (!r) return null
  const parts: string[] = []
  if (r.progress !== null) parts.push(`${Math.round(r.progress * 100)}%`)
  if (r.counts.in_progress > 0) parts.push(`${r.counts.in_progress} in progress`)
  if (r.overdue > 0) parts.push(`${r.overdue} overdue`)
  if (parts.length === 1 && r.progress === 0) return null
  // Not `dueSoon`: on a row it would compete with the row's own deadline, shown to the minute.
  return parts.length > 0 ? parts.join(' · ') : null
}
