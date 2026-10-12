import { useEffect } from 'react'

/** One thing that was opened, enough to list it and go back to it. */
export type Recent = {
  /** The object's type, which with `id` makes it one thing. */
  type: string
  id: string
  title: string
  /** Where opening it again goes. */
  to: string
  /** What kind of thing it is, as a word a row can show ("Person"). */
  kind: string
}

const KEY = 'ctws.recent'
/** As many as fit above the fold of the search dialog's first screen. */
const KEEP = 8

/**
 * WHAT WAS OPENED LATELY, newest first: what search shows before anything is typed. With no row
 * per kind in the rail, the way back to the person or meeting from a minute ago is this list.
 *
 * A per-viewer convenience, so localStorage and not the server; and every access is wrapped,
 * because in a private window or with site data cleared localStorage throws, and remembering
 * recent things is not worth a blank page.
 */
export function recentList(): Recent[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (r): r is Recent =>
        typeof r === 'object' &&
        r !== null &&
        ['type', 'id', 'title', 'to', 'kind'].every(
          (k) => typeof (r as Record<string, unknown>)[k] === 'string',
        ),
    )
  } catch {
    return []
  }
}

export function recordRecent(entry: Recent): void {
  const others = recentList().filter((r) => !(r.type === entry.type && r.id === entry.id))
  try {
    localStorage.setItem(KEY, JSON.stringify([entry, ...others].slice(0, KEEP)))
  } catch {
    // Recent things simply stop being remembered.
  }
}

/** Records `entry` when it is shown, and again if what it says changes (a rename). */
export function useRecordRecent(entry: Recent | null): void {
  const key = entry ? JSON.stringify(entry) : null
  useEffect(() => {
    if (key) recordRecent(JSON.parse(key) as Recent)
  }, [key])
}
