import type { TaskResponse } from '@ctws/contracts'
import { useMemo, useState } from 'react'
import { isFinished } from '../../status'
import { loadShowDone, saveShowDone } from '../../tree/collapse'

/**
 * A finished row leaves the tree unless asked back, except a finished parent with unfinished
 * children, and a row finished right here, kept for this mount so a second `x` can undo it.
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
