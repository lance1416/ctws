import { OBJECT_TYPES, type ObjectType } from '@ctws/contracts'
import { useNavigate, useSearchParams } from 'react-router-dom'

/**
 * THE INSPECTOR'S ADDRESS (FR-022): `?inspect=<type>:<id>` on whatever page is open, so a reload
 * brings it back and the page under it stays. Any other search parameter is left alone.
 */
const INSPECT = 'inspect'

export type Inspected = { type: ObjectType; id: string }

export function parseInspect(value: string | null): Inspected | null {
  if (!value) return null
  const at = value.indexOf(':')
  if (at < 1) return null
  const type = value.slice(0, at)
  const id = value.slice(at + 1)
  if (!id || !(OBJECT_TYPES as readonly string[]).includes(type)) return null
  return { type: type as ObjectType, id }
}

export const formatInspect = ({ type, id }: Inspected): string => `${type}:${id}`

/** The element that opened the inspector, so closing can hand focus back to it. */
let opener: HTMLElement | null = null

export function useInspector(): {
  open: Inspected | null
  show: (thing: Inspected) => void
  close: () => void
} {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const open = parseInspect(params.get(INSPECT))
  const withParams = (edit: (next: URLSearchParams) => void) => {
    const next = new URLSearchParams(window.location.search)
    edit(next)
    const search = next.toString()
    navigate({ search: search ? `?${search}` : '' })
  }
  return {
    open,
    show: (thing) => {
      opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
      withParams((next) => next.set(INSPECT, formatInspect(thing)))
    },
    close: () => {
      withParams((next) => next.delete(INSPECT))
      opener?.focus()
      opener = null
    },
  }
}
