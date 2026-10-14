import { createContext, useContext, useEffect } from 'react'

/**
 * WHAT A PAGE IS DRAWN ON: the sheet, as almost every page is, or the desk.
 *
 * The Workbench is the one desk: a ground its tiles sit on, a step darker than paper. The page
 * says so and the layout paints `main`, rather than the page painting a slab of its own inside
 * `main` that would have to know the layout's padding to reach its edges.
 */
export type Ground = 'sheet' | 'desk'

export const SetGround = createContext<((ground: Ground) => void) | null>(null)

/** Draws the page on `ground` while it is mounted; leaving it gives the sheet back. */
export function useGround(ground: Ground): void {
  const set = useContext(SetGround)
  useEffect(() => {
    set?.(ground)
    return () => set?.('sheet')
  }, [set, ground])
}
