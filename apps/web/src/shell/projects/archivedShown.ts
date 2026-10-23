import { useSyncExternalStore } from 'react'

/**
 * Whether the sidebar lists the archived projects under their count (FR-051): the overview's "2
 * archived projects" opens it, the sidebar's own row opens and closes it. For this visit only.
 */
let shown = false
const listeners = new Set<() => void>()

export function showArchived(next: boolean): void {
  if (shown === next) return
  shown = next
  for (const listener of listeners) listener()
}

const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useArchivedShown(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => shown,
    () => shown,
  )
}
