import { useEffect, useState } from 'react'

/**
 * From this width the detail is a column beside the list; below it, an overlay. The pane reads
 * `useWidePane` and says which it is (`data-detail-mode`), which the layout's grid follows, so the
 * number is written only here.
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
