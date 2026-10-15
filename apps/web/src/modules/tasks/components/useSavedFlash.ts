import { useEffect, useState } from 'react'

/** The row a save from the pane just landed on, for two seconds: it says "Saved" for that long. */
export function useSavedFlash() {
  const [savedId, setSavedId] = useState<string | null>(null)
  useEffect(() => {
    if (!savedId) return
    const timer = setTimeout(() => setSavedId(null), 2000)
    return () => clearTimeout(timer)
  }, [savedId])
  return [savedId, setSavedId] as const
}
