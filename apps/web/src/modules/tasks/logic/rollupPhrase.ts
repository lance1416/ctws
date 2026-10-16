import type { RollupResponse } from '@ctws/contracts'

/**
 * "60% · 2 in progress · 1 overdue", each part dropped when it has nothing to say. A lone "0%" is
 * dropped too: every unstarted parent would repeat what its children already show.
 */
export function rollupPhrase(r: RollupResponse | undefined): string | null {
  if (!r) return null
  const parts: string[] = []
  if (r.progress !== null) parts.push(`${Math.round(r.progress * 100)}%`)
  if (r.inProgress > 0) parts.push(`${r.inProgress} in progress`)
  if (r.overdue > 0) parts.push(`${r.overdue} overdue`)
  if (parts.length === 1 && r.progress === 0) return null
  return parts.length > 0 ? parts.join(' · ') : null
}
