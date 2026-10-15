import { useState } from 'react'
import { loadCollapsed, saveCollapsed } from '../../tree/collapse'

/** The tree's folded rows, remembered per project. */
export function useCollapsed(projectId: string) {
  const [collapsed, setCollapsed] = useState(() => loadCollapsed(projectId))
  const update = (change: (next: Set<string>) => void) => {
    const next = new Set(collapsed)
    change(next)
    setCollapsed(next)
    saveCollapsed(projectId, next)
  }
  return {
    collapsed,
    toggle: (id: string) =>
      update((next) => {
        if (!next.delete(id)) next.add(id)
      }),
    fold: (id: string) => update((next) => next.add(id)),
    /** Opens these rows, if any of them is folded. */
    unfold: (ids: readonly string[]) => {
      if (ids.some((id) => collapsed.has(id)))
        update((next) => ids.forEach((id) => next.delete(id)))
    },
  }
}
