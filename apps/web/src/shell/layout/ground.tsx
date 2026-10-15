import { createContext, useContext, useEffect } from 'react'

/**
 * What a page is drawn on: the sheet, or the desk the Workbench's tiles sit on. The layout paints
 * `main`, so a page need not know the layout's padding to reach its edges.
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
