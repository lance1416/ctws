import { useEffect, useState } from 'react'

type SortKeyTools = typeof import('@ctws/core/sort-key')

/**
 * Loads `sortKey` on first use, once for the whole app: it carries the pinyin dictionary, as large
 * as the rest of the app, and only the person editor needs it in the browser (the server files
 * people itself). Until it arrives, the editor says where the name shows and not yet where it is
 * filed. `pending` is module-level so every caller shares the one import.
 */
let pending: Promise<SortKeyTools> | null = null

export function useSortKey(): SortKeyTools['sortKey'] | null {
  const [tools, setTools] = useState<SortKeyTools | null>(null)
  useEffect(() => {
    let alive = true
    pending ??= import('@ctws/core/sort-key')
    void pending.then((m) => {
      if (alive) setTools(m)
    })
    return () => {
      alive = false
    }
  }, [])
  return tools?.sortKey ?? null
}
