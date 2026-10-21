import { useEffect, useState } from 'react'
import { onServerClock, serverNow } from './serverClock'

/**
 * The current time on the server's clock, read again each minute and when the page comes back
 * into view: a quiet page is not re-rendered, so a time read in render goes stale.
 */
export function useNow(): Date {
  const [now, setNow] = useState(serverNow)
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>
    // Just past the next minute boundary, so the shown minute turns with the clock's.
    const next = () => 60_000 - (serverNow().getTime() % 60_000) + 50
    const tick = () => {
      setNow(serverNow())
      timer = setTimeout(tick, next())
    }
    timer = setTimeout(tick, next())
    // Timers pause while the machine sleeps, so read the clock on the way back.
    const onShow = () => {
      if (document.visibilityState !== 'visible') return
      clearTimeout(timer)
      tick()
    }
    document.addEventListener('visibilitychange', onShow)
    const stop = onServerClock(() => setNow(serverNow()))
    return () => {
      clearTimeout(timer)
      document.removeEventListener('visibilitychange', onShow)
      stop()
    }
  }, [])
  return now
}
