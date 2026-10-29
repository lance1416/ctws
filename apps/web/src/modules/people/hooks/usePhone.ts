import { useEffect, useState } from 'react'

type PhoneTools = typeof import('../logic/phoneNumbers')

/**
 * Loads the phone-number module (about 80 KB) on first use, once for the whole app; until it arrives,
 * numbers show as stored. `pending` is module-level so every caller shares the one import.
 */
let pending: Promise<PhoneTools> | null = null

export function usePhone(): PhoneTools | null {
  const [tools, setTools] = useState<PhoneTools | null>(null)
  useEffect(() => {
    let alive = true
    pending ??= import('../logic/phoneNumbers')
    void pending.then((m) => {
      if (alive) setTools(m)
    })
    return () => {
      alive = false
    }
  }, [])
  return tools
}
