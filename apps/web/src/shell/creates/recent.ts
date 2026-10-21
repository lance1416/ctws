import type { Creator } from '../contract'

const KEY = 'ctws:new-recent'
/** How many kinds the New menu shows before typing (FR-026). */
const SHOWN = 4

/**
 * What can belong to a project, the only kinds a project's New offers (FR-026): a person or an
 * organisation is made in its own module, from its sidebar's `+` or `N` and a key.
 */
const OF_A_PROJECT: readonly string[] = [
  'task',
  'meeting',
  'note',
  'communication',
  'reading',
  'resource',
]

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
 * typing finds the rest by the start of their name. Pure, so the order is testable without a
 * browser.
 */
export function menuOrder(
  creators: readonly Creator[],
  recent: readonly string[],
  typed: string,
): { shown: Creator[]; hidden: Creator[] } {
  const offered = creators.filter((c) => OF_A_PROJECT.includes(c.kind))
  const t = typed.trim().toLocaleLowerCase()
  if (t) {
    const shown = offered.filter((c) => c.label.toLocaleLowerCase().startsWith(t))
    return { shown, hidden: [] }
  }
  const byRecent = [...offered].sort((a, b) => {
    const ra = recent.indexOf(a.kind)
    const rb = recent.indexOf(b.kind)
    if (ra === -1 && rb === -1) return 0
    if (ra === -1) return 1
    if (rb === -1) return -1
    return ra - rb
  })
  return { shown: byRecent.slice(0, SHOWN), hidden: byRecent.slice(SHOWN) }
}
