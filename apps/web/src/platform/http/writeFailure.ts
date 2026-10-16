import { useSyncExternalStore } from 'react'
import { problemText } from './api'

/** What a failed write says, and the page it failed on. */
type Failure = { text: string; path: string }

/**
 * The last write that failed with nobody to say so: the frame shows it on the page it failed on,
 * until the next write starts. A write that says its own failure opts out with `meta.ownsError`.
 */
let failure: Failure | null = null
const listeners = new Set<() => void>()

function set(next: Failure | null): void {
  failure = next
  for (const listener of listeners) listener()
}

export function reportWriteFailure(error: unknown): void {
  set({
    text: problemText(error) ?? "Couldn't save the change",
    path: typeof window === 'undefined' ? '' : window.location.pathname,
  })
}

export function clearWriteFailure(): void {
  if (failure) set(null)
}

const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** The unclaimed failure, or null. */
export function writeFailure(): Failure | null {
  return failure
}

/** What the frame says on the page at `path`: a failure on another page is not news here. */
export function useWriteFailure(path: string): string | null {
  const now = useSyncExternalStore(subscribe, writeFailure)
  return now && now.path === path ? now.text : null
}
