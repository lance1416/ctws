import { useEffect, useState } from 'react'

/** How long a region waits for its data before it shows that it is waiting. */
const SHOWN_AFTER_MS = 400

/**
 * A REGION STILL BEING READ, WHOSE LAYOUT ITS DATA DECIDES (DES-001 "加载"): nothing at first, then,
 * past 400ms, one neutral bar across every column at a block head's 40. No skeleton and no guess
 * at the columns or the order the data will choose; it comes in at once when all is read.
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
