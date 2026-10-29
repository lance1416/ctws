import { useEffect, useState } from 'react'

/**
 * Whether the browser has a connection (FR-033). The browser's own word for it: it turns false
 * when the network goes, and back when it returns; a server that is down is not "offline".
 */
export function useOnline(): boolean {
  const [online, setOnline] = useState(() =>
    typeof navigator === 'undefined' ? true : navigator.onLine,
  )
  useEffect(() => {
    const up = () => setOnline(true)
    const down = () => setOnline(false)
    window.addEventListener('online', up)
    window.addEventListener('offline', down)
    return () => {
      window.removeEventListener('online', up)
      window.removeEventListener('offline', down)
    }
  }, [])
  return online
}

/** Why a save does nothing while offline (FR-033), said where it is hovered. */
const OFFLINE_WHY = 'Offline. Nothing can be saved until the connection is back.'

/**
 * A button that saves, greyed while offline (FR-033, U-27): `aria-disabled` rather than
 * `disabled`, so hovering it still says why, and its press does nothing. Spread `props` on the
 * button, wrap its handler in `gate`, and give it `aria-disabled:` styles.
 */
export function useSaveGate() {
  const online = useOnline()
  return {
    online,
    props: online ? {} : { 'aria-disabled': true as const, title: OFFLINE_WHY },
    gate:
      <A extends unknown[]>(run: (...args: A) => void) =>
      (...args: A) => {
        if (online) run(...args)
      },
  }
}
