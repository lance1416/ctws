import { createContext, useContext, useEffect, useState } from 'react'

/**
 * The width at which the task detail stops being an overlay and becomes a third column that
 * COEXISTS with the list. Below it the pane would eat the list it was opened from, so it goes
 * back to floating over the page with a scrim and a focus trap.
 *
 * 1280 is the design plan's number (section 4), and this is the ONLY place it is written: the
 * layout reserves the column from this hook's answer rather than from a Tailwind `xl:` class,
 * because two copies of the number would eventually disagree and the disagreement would be
 * invisible except at the one width where the pane was both reserved and overlaid.
 */
const WIDE_PANE_PX = 1280
const WIDE_PANE_QUERY = `(min-width: ${WIDE_PANE_PX}px)`

/** True while the viewport is wide enough for the detail to be a pane rather than an overlay. */
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

/**
 * How the detail tells the layout it is open, so the layout can reserve the third column. The
 * detail is rendered by the page, several levels below the grid that has to make room for it;
 * a context is the one way to say so without every page threading the state through.
 */
export const DetailPaneContext = createContext<((open: boolean) => void) | null>(null)

/** Reserves the pane for as long as the calling component is mounted. */
export function useReservePane(): void {
  const reserve = useContext(DetailPaneContext)
  useEffect(() => {
    reserve?.(true)
    return () => reserve?.(false)
  }, [reserve])
}
