import { OBJECT_TYPES, type ObjectType } from '@ctws/contracts'
import { useCallback, useSyncExternalStore } from 'react'
import { serverNow } from '../../platform/time/serverClock'
import { useMe } from '../auth/useMe'

/**
 * GOING OUT, AND COMING BACK (FR-028): the last resource opened from CTWS, and the thing it was
 * opened from. Only the last one is kept; it is offered back for a day, until it is settled (Mark
 * done, Still on it) or another is opened.
 */
export type Away = {
  url: string
  /** What the resource is called where it was clicked. */
  name: string
  /** The project it sits in, for its square: the project itself, when that is what it is. */
  from: { type: ObjectType; id: string; title: string; projectId: string | null }
  /** When it was opened, in ms on the server's clock. */
  at: number
}

/** Opened longer ago than this, it is no longer offered back. */
const OFFERED_MS = 24 * 60 * 60 * 1000

/** Per account: two people sharing a browser must never see each other's things. */
const keyFor = (userId: string) => `ctws.away.${userId}`

/**
 * Whether it is still worth offering back at `now`. A `now` read a moment before it was opened (a
 * page's clock turns each minute) is just now.
 */
export const stillOffered = (away: Away, now: Date): boolean => now.getTime() - away.at < OFFERED_MS

/** "Just now", "12 min ago", "3 h ago": how long since it was opened. */
export function agoWords(away: Away, now: Date): string {
  const minutes = Math.floor((now.getTime() - away.at) / 60_000)
  if (minutes < 1) return 'Just now'
  if (minutes < 60) return `${minutes} min ago`
  return `${Math.floor(minutes / 60)} h ago`
}

function isAway(v: unknown): v is Away {
  if (typeof v !== 'object' || v === null) return false
  const a = v as Record<string, unknown>
  const from = a.from as Record<string, unknown> | null | undefined
  return (
    typeof a.url === 'string' &&
    typeof a.name === 'string' &&
    typeof a.at === 'number' &&
    typeof from === 'object' &&
    from !== null &&
    OBJECT_TYPES.includes(from.type as ObjectType) &&
    typeof from.id === 'string' &&
    typeof from.title === 'string' &&
    (from.projectId === null || typeof from.projectId === 'string')
  )
}

/**
 * The page's side of it, which is not kept: whether the tab has been come back to since the last
 * resource was opened, and whether its note at the foot was closed. Closing that note leaves the
 * workbench's card.
 */
const tab = { returned: false, closed: false }
const listeners = new Set<() => void>()
const tell = () => {
  for (const l of listeners) l()
}
const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => listeners.delete(l)
}

/** The stored one, read once per change so its object is the same between renders. */
let cached: { raw: string | null; away: Away | null } = { raw: null, away: null }
function read(userId: string): Away | null {
  let raw: string | null = null
  try {
    raw = localStorage.getItem(keyFor(userId))
  } catch {
    // Every localStorage access is wrapped: it throws in a private window.
  }
  if (raw === cached.raw) return cached.away
  let away: Away | null = null
  try {
    const parsed: unknown = raw ? JSON.parse(raw) : null
    away = isAway(parsed) ? parsed : null
  } catch {
    away = null
  }
  cached = { raw, away }
  return away
}

function write(userId: string, away: Away | null): void {
  try {
    if (away) localStorage.setItem(keyFor(userId), JSON.stringify(away))
    else localStorage.removeItem(keyFor(userId))
  } catch {
    // It simply stops being offered back.
  }
  tell()
}

/** The tab is shown again: what was opened from it can be asked about. */
export function cameBack(): void {
  if (tab.returned) return
  tab.returned = true
  tell()
}

/** The last resource opened, while it is still offered; null once settled or a day old. */
export function useAway(now: Date): Away | null {
  const userId = useMe().data?.id
  const away = useSyncExternalStore(subscribe, () => (userId ? read(userId) : null))
  return away && stillOffered(away, now) ? away : null
}

/** Whether the note at the foot is to be shown: the tab came back to, and the note not closed. */
export function useReturned(): boolean {
  return useSyncExternalStore(subscribe, () => tab.returned && !tab.closed)
}

/** Closes the note at the foot only: the workbench's card stays. */
export function closeNote(): void {
  tab.closed = true
  tell()
}

/** Records where a click on a resource goes, and from what. */
export function useGoOut(): (away: Omit<Away, 'at'>) => void {
  const userId = useMe().data?.id
  return useCallback(
    (away) => {
      if (!userId) return
      tab.returned = false
      tab.closed = false
      write(userId, { ...away, at: serverNow().getTime() })
    },
    [userId],
  )
}

/** Mark done or Still on it: not asked about again until a resource is opened again. */
export function useSettle(): () => void {
  const userId = useMe().data?.id
  return useCallback(() => {
    if (userId) write(userId, null)
  }, [userId])
}
