import { useCallback, useEffect } from 'react'
import { useMe } from '../auth/useMe'

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

/** Per account: two people sharing a browser must never see each other's things. */
const keyFor = (userId: string) => `ctws.recent.${userId}`
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
export function recentList(userId: string): Recent[] {
  try {
    const raw = localStorage.getItem(keyFor(userId))
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

export function recordRecent(userId: string, entry: Recent): void {
  const others = recentList(userId).filter((r) => !(r.type === entry.type && r.id === entry.id))
  save(userId, [entry, ...others].slice(0, KEEP))
}

/** Drops a thing that is gone: a row nobody can open is worse than one row fewer. */
export function forgetRecent(userId: string, type: string, id: string): void {
  const list = recentList(userId)
  const kept = list.filter((r) => !(r.type === type && r.id === id))
  if (kept.length !== list.length) save(userId, kept)
}

function save(userId: string, list: Recent[]): void {
  try {
    localStorage.setItem(keyFor(userId), JSON.stringify(list))
  } catch {
    // Recent things simply stop being remembered.
  }
}

/** Records `entry` when it is shown, and again if what it says changes (a rename). */
export function useRecordRecent(entry: Recent | null): void {
  const userId = useMe().data?.id
  const key = entry ? JSON.stringify(entry) : null
  useEffect(() => {
    if (key && userId) recordRecent(userId, JSON.parse(key) as Recent)
  }, [key, userId])
}

/** For whatever deletes a thing: forgets it for whoever is signed in. */
export function useForgetRecent(): (type: string, id: string) => void {
  const userId = useMe().data?.id
  return useCallback(
    (type: string, id: string) => {
      if (userId) forgetRecent(userId, type, id)
    },
    [userId],
  )
}

/**
 * For a page that finds its thing GONE -- deleted on another device, or before this list knew --
 * which is the one place that learns it.
 */
export function useForgetWhenGone(type: string, id: string | null, gone: boolean): void {
  const forget = useForgetRecent()
  useEffect(() => {
    if (gone && id) forget(type, id)
  }, [forget, gone, id, type])
}
