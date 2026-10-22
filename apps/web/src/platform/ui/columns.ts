import { useLayoutEffect, useState, type RefObject } from 'react'

/** The narrowest a content column may be, and the most a page has (FR-014, DES-001 section 4). */
const COLUMN_MIN = 360
const COLUMNS_MAX = 6
/** Between two columns: `gap-3`. */
const COLUMN_GAP = 12

/** How many columns of at least 360 fit across `width`: from one up to six. */
export function columnsIn(width: number): number {
  const fit = Math.floor((width + COLUMN_GAP) / (COLUMN_MIN + COLUMN_GAP))
  return Math.min(COLUMNS_MAX, Math.max(1, fit))
}

/**
 * How many content columns the element is wide enough for, kept current as it is resized: 3 on the
 * 1440 screen, 4 at 1920, 6 on the 2560 one. Below the desk width the page is one column whatever
 * this says; that is the stylesheet's to decide.
 */
export function useColumns(ref: RefObject<HTMLElement | null>): number {
  const [count, setCount] = useState(3)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = () => setCount(columnsIn(el.clientWidth))
    measure()
    // Not in the unit tests' DOM; the first measure stands.
    if (typeof ResizeObserver === 'undefined') return
    const watch = new ResizeObserver(measure)
    watch.observe(el)
    return () => watch.disconnect()
  }, [ref])
  return count
}
