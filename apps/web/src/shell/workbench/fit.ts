import { createContext, useContext, useLayoutEffect, useState } from 'react'

/**
 * Whether the workbench's places have heights of their own (a grid of rows) or take their
 * content's (one column, on a phone).
 */
export const FixedPlaces = createContext(false)

/**
 * How many rows of `rowPx` a widget's list shows, at most `most`: in a place of its own height, as
 * many as fit, since a widget never scrolls (FR-075) and the rest are a click away; in one column,
 * `most`. Give the returned ref to an element whose height is its place's, not its rows'; it is
 * measured from when it is first drawn, which is after the widget's data has come.
 */
export function useRowsThatFit(
  rowPx: number,
  most: number,
  /** Height in the element that is not rows: captions, the gap between two lists. */
  reservedPx = 0,
): [(el: HTMLElement | null) => void, number] {
  const fixed = useContext(FixedPlaces)
  const [el, setEl] = useState<HTMLElement | null>(null)
  const [fit, setFit] = useState(most)
  useLayoutEffect(() => {
    if (!el || !fixed) return
    const measure = () => setFit(Math.max(0, Math.floor((el.clientHeight - reservedPx) / rowPx)))
    measure()
    // Not in the unit tests' DOM; the first measure stands.
    if (typeof ResizeObserver === 'undefined') return
    const watch = new ResizeObserver(measure)
    watch.observe(el)
    return () => watch.disconnect()
  }, [el, rowPx, reservedPx, fixed])
  return [setEl, fixed ? Math.min(fit, most) : most]
}
