import { useEffect, useState } from 'react'

/** How long a region waits for its data before it shows that it is waiting. */
const SHOWN_AFTER_MS = 400

/**
 * For a region whose layout depends on its data: one plain bar after 400ms, not a skeleton, which
 * would guess the columns and order the data will choose.
 */
export function Waiting() {
  const [shown, setShown] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setShown(true), SHOWN_AFTER_MS)
    return () => clearTimeout(t)
  }, [])
  return (
    <div
      aria-busy="true"
      className={`col-span-full h-10 rounded-container ${shown ? 'bg-hover' : ''}`}
    />
  )
}
