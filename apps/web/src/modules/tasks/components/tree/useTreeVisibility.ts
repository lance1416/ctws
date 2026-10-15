import type { TaskResponse } from '@ctws/contracts'
import { useMemo, useState } from 'react'
import { isFinished } from '../../status'
import { loadShowDone, saveShowDone } from '../../tree/collapse'

/**
 * WHAT IS LEFT TO DO. A finished row leaves the tree unless the person asks for it back, with two
 * exceptions. A finished PARENT with unfinished children stays, dimmed: hiding it would take its
 * children with it, and a list that loses tasks cannot be trusted. And a row finished RIGHT HERE
 * stays for this mount (`keep`), so `x` does not pull it from under the cursor and a second `x`
 * still has a row to undo on.
 */
export function useTreeVisibility(projectId: string, all: readonly TaskResponse[]) {
  const [showDone, setShowDone] = useState(() => loadShowDone(projectId))
  const [kept, setKept] = useState<ReadonlySet<string>>(() => new Set())

  const visible = useMemo(() => {
    if (showDone) return all
    const index = new Map(all.map((t) => [t.id, t]))
    const live = new Set<string>()
    for (const t of all) {
      if (isFinished(t.status)) continue
      // Walk up marking ancestors: an unfinished task keeps every parent above it on screen.
      // `live.has` stops the walk, so each chain is climbed once and the whole pass is O(n).
      for (let at = t as TaskResponse | undefined; at && !live.has(at.id);) {
        live.add(at.id)
        at = at.parentId === null ? undefined : index.get(at.parentId)
      }
    }
    return all.filter((t) => live.has(t.id) || kept.has(t.id))
  }, [all, showDone, kept])

  const setShown = (next: boolean) => {
    setShowDone(next)
    saveShowDone(projectId, next)
  }
  return {
    visible,
    hiddenDone: all.length - visible.length,
    showDone,
    toggleDone: () => setShown(!showDone),
    showFinished: () => setShown(true),
    /** Keeps these just-finished rows on screen. */
    keep: (ids: Iterable<string>) => setKept((prev) => new Set([...prev, ...ids])),
  }
}
