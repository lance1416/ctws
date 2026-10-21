import { useEffect, useState } from 'react'

/** True once `ms` have passed since mount: nothing is drawn for a load's first 300 ms (FR-031). */
export function useDelayed(ms = 300): boolean {
  const [passed, setPassed] = useState(false)
  useEffect(() => {
    const timer = setTimeout(() => setPassed(true), ms)
    return () => clearTimeout(timer)
  }, [ms])
  return passed
}
