import { useCallback, useEffect } from 'react'
import { useMe } from '../auth/useMe'

export type Recent = {
  type: string
  id: string
  title: string
  to: string
  /** As a word a row can show ("Person"). */
  kind: string
}

/** Per account: two people sharing a browser must never see each other's things. */
const keyFor = (userId: string) => `ctws.recent.${userId}`
/** As many as fit above the fold of the search dialog's first screen. */
const KEEP = 8

/**
 * What was opened lately, newest first, for search before anything is typed. Every localStorage
 * access is wrapped: it throws in a private window or with site data cleared.
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

export function useForgetRecent(): (type: string, id: string) => void {
  const userId = useMe().data?.id
  return useCallback(
    (type: string, id: string) => {
      if (userId) forgetRecent(userId, type, id)
    },
    [userId],
  )
}

/** For a page that finds its thing gone, deleted elsewhere: the one place that learns it. */
export function useForgetWhenGone(type: string, id: string | null, gone: boolean): void {
  const forget = useForgetRecent()
  useEffect(() => {
    if (gone && id) forget(type, id)
  }, [forget, gone, id, type])
}
