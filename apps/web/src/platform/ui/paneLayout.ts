import { createContext, useContext, useEffect, useState } from 'react'

/**
 * From this width the detail is a column beside the list; below it, an overlay. The layout reads
 * `useWidePane` rather than an `xl:` class, so the number is written only here.
 */
const WIDE_PANE_PX = 1280
const WIDE_PANE_QUERY = `(min-width: ${WIDE_PANE_PX}px)`

export function useWidePane(): boolean {
  const [wide, setWide] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(WIDE_PANE_QUERY).matches,
  )
  useEffect(() => {
    const mq = window.matchMedia(WIDE_PANE_QUERY)
    const onChange = () => setWide(mq.matches)
    onChange()
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])
  return wide
}

/** How the detail, rendered deep inside a page, asks the layout to reserve the third column. */
export const DetailPaneContext = createContext<((open: boolean) => void) | null>(null)

/** Reserves the pane for as long as the calling component is mounted. */
export function useReservePane(): void {
  const reserve = useContext(DetailPaneContext)
  useEffect(() => {
    reserve?.(true)
    return () => reserve?.(false)
  }, [reserve])
}
