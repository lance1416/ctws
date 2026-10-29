import { OBJECT_TYPES, type ObjectType } from '@ctws/contracts'
import { useNavigate, useSearchParams } from 'react-router-dom'
import type { ListAct } from '../inspector/narrow'

/**
 * THE INSPECTOR'S ADDRESS (FR-022): `?inspect=<type>:<id>` on whatever page is open, so a reload
 * brings it back and the page under it stays; `<type>:<id>@<when>` for one occurrence of a series
 * (a meeting's, FR-067); `list:<name>` for a block's full list (FR-011). Any other search
 * parameter is left alone.
 */
const INSPECT = 'inspect'

export type Inspected = { type: ObjectType | 'list'; id: string; at?: string }

export function parseInspect(value: string | null): Inspected | null {
  if (!value) return null
  const colon = value.indexOf(':')
  if (colon < 1) return null
  const type = value.slice(0, colon)
  const [id, at] = value.slice(colon + 1).split('@') as [string, string | undefined]
  if (!id || !(type === 'list' || (OBJECT_TYPES as readonly string[]).includes(type))) return null
  const kind = type as Inspected['type']
  return at ? { type: kind, id, at } : { type: kind, id }
}

export const formatInspect = ({ type, id, at }: Inspected): string =>
  `${type}:${id}${at ? `@${at}` : ''}`

/** The element that opened the inspector, so closing can hand focus back to it. */
let opener: HTMLElement | null = null
/**
 * The action of the list or block a thing was opened from, from a page (Remove from Job hunt):
 * the opened page offers it too, as one opened from a list in the inspector does (U-29).
 */
let openedWith: { key: string; act: ListAct } | null = null

/** What the page it was opened from offers to do with the thing shown, if anything. */
export const openedAct = (thing: Inspected): ListAct | null =>
  openedWith?.key === formatInspect(thing) ? openedWith.act : null

export function useInspector(): {
  open: Inspected | null
  show: (thing: Inspected, act?: ListAct) => void
  /** What it shows, changed from inside it: the address keeps only the one shown (FR-022). */
  swap: (thing: Inspected) => void
  close: () => void
} {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const open = parseInspect(params.get(INSPECT))
  const withParams = (edit: (next: URLSearchParams) => void, replace = false) => {
    const next = new URLSearchParams(window.location.search)
    edit(next)
    const search = next.toString()
    navigate({ search: search ? `?${search}` : '' }, { replace })
  }
  return {
    open,
    show: (thing, act) => {
      opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
      openedWith = act ? { key: formatInspect(thing), act } : null
      withParams((next) => next.set(INSPECT, formatInspect(thing)))
    },
    swap: (thing) => withParams((next) => next.set(INSPECT, formatInspect(thing)), true),
    close: () => {
      withParams((next) => next.delete(INSPECT))
      opener?.focus()
      opener = null
    },
  }
}
