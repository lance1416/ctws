import { useEffect, useState } from 'react'

/** As long as a region waits before it shows that it is waiting (`Waiting`). */
const SHOWN_AFTER_MS = 400

/**
 * A THING'S PAGE WHILE THE THING ITSELF IS STILL BEING READ: nothing at first, then, past 400ms,
 * its head's place, the 56 badge or avatar and a bar as wide as a title, where the head will be.
 * What is under the head waits with it.
 */
export function PageHeadWaiting({ round = false }: { round?: boolean }) {
  const [shown, setShown] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setShown(true), SHOWN_AFTER_MS)
    return () => clearTimeout(t)
  }, [])
  if (!shown) return null
  return (
    <div aria-busy="true" className="flex items-center gap-x-4">
      <span
        className={`size-14 shrink-0 bg-hover ${round ? 'rounded-full' : 'rounded-container'}`}
      />
      <span className="h-6 w-72 max-w-full rounded-small bg-hover" />
    </div>
  )
}
