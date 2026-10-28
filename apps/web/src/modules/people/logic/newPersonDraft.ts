import { useSyncExternalStore } from 'react'

/**
 * The person being written down on New person, as the sidebar shows them where they will be filed,
 * marked New (FR-062). Null while nobody is being written down.
 */
type Draft = { name: string; sortKey: string; initials: string }

let draft: Draft | null = null
const listeners = new Set<() => void>()

export function setNewPersonDraft(next: Draft | null): void {
  if (draft?.name === next?.name && draft?.sortKey === next?.sortKey) return
  draft = next
  for (const listener of listeners) listener()
}

const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useNewPersonDraft(): Draft | null {
  return useSyncExternalStore(
    subscribe,
    () => draft,
    () => draft,
  )
}
