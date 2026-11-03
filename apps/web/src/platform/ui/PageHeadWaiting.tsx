import { useEffect, useState } from 'react'

/** As long as a region waits before it shows that it is waiting (`Waiting`). */
const SHOWN_AFTER_MS = 400

/**
 * A THING'S PAGE WHILE THE THING ITSELF IS STILL BEING READ: nothing at first, then, past 400ms,
 * its head's place, the 56 badge or avatar beside two bars, the title's line and the line under
 * it, each as high as the head's own so the badge sits where it will. What is under the head waits
 * with it.
 */
export function PageHeadWaiting({
  round = false,
  line = 22,
}: {
  round?: boolean
  /** How high the head's line under its title is: its tags 22, a reading item's controls 28. */
  line?: 22 | 28
}) {
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
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="flex h-8.5 items-center">
          <span className="h-6 w-72 max-w-full rounded-small bg-hover" />
        </span>
        <span
          className={`w-48 max-w-full rounded-small bg-hover ${line === 28 ? 'h-7' : 'h-5.5'}`}
        />
      </span>
    </div>
  )
}
