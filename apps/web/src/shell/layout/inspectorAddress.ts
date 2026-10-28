import { OBJECT_TYPES, type ObjectType } from '@ctws/contracts'
import { useNavigate, useSearchParams } from 'react-router-dom'

/**
 * THE INSPECTOR'S ADDRESS (FR-022): `?inspect=<type>:<id>` on whatever page is open, so a reload
 * brings it back and the page under it stays; `<type>:<id>@<when>` for one occurrence of a series
 * (a meeting's, FR-067). Any other search parameter is left alone.
 */
const INSPECT = 'inspect'

export type Inspected = { type: ObjectType; id: string; at?: string }

export function parseInspect(value: string | null): Inspected | null {
  if (!value) return null
  const colon = value.indexOf(':')
  if (colon < 1) return null
  const type = value.slice(0, colon)
  const [id, at] = value.slice(colon + 1).split('@') as [string, string | undefined]
  if (!id || !(OBJECT_TYPES as readonly string[]).includes(type)) return null
  return at ? { type: type as ObjectType, id, at } : { type: type as ObjectType, id }
}

export const formatInspect = ({ type, id, at }: Inspected): string =>
  `${type}:${id}${at ? `@${at}` : ''}`

/** The element that opened the inspector, so closing can hand focus back to it. */
let opener: HTMLElement | null = null

export function useInspector(): {
  open: Inspected | null
  show: (thing: Inspected) => void
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
    show: (thing) => {
      opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
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
