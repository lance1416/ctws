import type { Creator } from '../contract'

const KEY = 'ctws:new-recent'
/** How many kinds the New menu shows before typing (FR-026). */
const SHOWN = 4

/** The kinds made lately, newest first, per browser. */
export function recentKinds(): string[] {
  try {
    const raw = localStorage.getItem(KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed.filter((k): k is string => typeof k === 'string') : []
  } catch {
    return []
  }
}

export function rememberKind(kind: string): void {
  try {
    localStorage.setItem(
      KEY,
      JSON.stringify([kind, ...recentKinds().filter((k) => k !== kind)].slice(0, 8)),
    )
  } catch {
    // Not remembered; the menu keeps its default order.
  }
}

/**
 * The menu before typing: the kinds used lately, then the rest in the fixed order, cut to a few;
 * typing finds the rest. Pure, so the order is testable without a browser.
 */
export function menuOrder(
  creators: readonly Creator[],
  recent: readonly string[],
  typed: string,
): { shown: Creator[]; hidden: Creator[] } {
  const t = typed.trim().toLocaleLowerCase()
  if (t) {
    const shown = creators.filter((c) => c.label.toLocaleLowerCase().includes(t))
    return { shown, hidden: [] }
  }
  const byRecent = [...creators].sort((a, b) => {
    const ra = recent.indexOf(a.kind)
    const rb = recent.indexOf(b.kind)
    if (ra === -1 && rb === -1) return 0
    if (ra === -1) return 1
    if (rb === -1) return -1
    return ra - rb
  })
  return { shown: byRecent.slice(0, SHOWN), hidden: byRecent.slice(SHOWN) }
}
