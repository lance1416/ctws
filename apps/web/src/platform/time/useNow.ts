import { useEffect, useState } from 'react'

/**
 * NOW, KEPT CURRENT: the moment it is, read again on every new minute and whenever the page comes
 * back into view.
 *
 * A page that draws the time -- Today's now line, the Workbench's meetings line -- is left open
 * for hours. Reading `new Date()` while rendering only moves when something else re-renders the
 * page, and a quiet page is not re-rendered: Today left open at nine still said nine at three.
 * The value is passed down as `now`, so everything under it stays a function of its arguments.
 */
export function useNow(): Date {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>
    // To the next minute boundary (and a hair past it), so the shown minute turns when the
    // clock's does rather than up to a minute late.
    const next = () => 60_000 - (Date.now() % 60_000) + 50
    const tick = () => {
      setNow(new Date())
      timer = setTimeout(tick, next())
    }
    timer = setTimeout(tick, next())
    // A laptop opened after an hour asleep: timers were paused, so read the clock on the way back.
    const onShow = () => {
      if (document.visibilityState !== 'visible') return
      clearTimeout(timer)
      tick()
    }
    document.addEventListener('visibilitychange', onShow)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('visibilitychange', onShow)
    }
  }, [])
  return now
}
