import { useContext, useEffect, useRef, useState } from 'react'
import { useBlocker } from 'react-router-dom'
import { LeaveGuardContext } from './leaveGuard'

/**
 * One in-pane question for every way to lose an edit: closing, navigating, or logging out (asked
 * through `LeaveGuardContext`). Not `confirm()`, which would block the test automation.
 */
export type UnsavedGuard = {
  asking: boolean
  /** The way out is a navigation or a sign-out, rather than just closing the pane. */
  leaving: boolean
  /** The control the question opens on, so the answer is where focus already is. */
  focusOn: React.RefObject<HTMLButtonElement | null>
  /** Takes a way out: runs it when there is nothing to lose, asks first when there is. */
  leave: (go: () => void) => void
  /** "Keep editing": puts every way out back, including the navigation the router held. */
  keep: () => void
  /** "Discard": lets go of whichever way out was asked about. */
  discard: () => void
  /** Takes a way out without asking: what was typed is kept elsewhere (Esc, FR-029). */
  release: (go: () => void) => void
}

export function useUnsavedGuard(dirty: boolean): UnsavedGuard {
  const [askDiscard, setAskDiscard] = useState(false)
  const [logoutVia, setLogoutVia] = useState<(() => void) | null>(null)
  const [exitVia, setExitVia] = useState<(() => void) | null>(null)
  // A ref, so the router reads the current answer at the moment it navigates.
  const dirtyNow = useRef(dirty)
  dirtyNow.current = dirty
  // Set by Discard, so the navigation it causes is not blocked again; spent once the form is
  // clean, so the next edit in the same sheet is guarded afresh.
  const released = useRef(false)
  if (!dirty) released.current = false
  const blocker = useBlocker(() => dirtyNow.current && !released.current)
  const leaving = blocker.state === 'blocked' || logoutVia !== null
  const asking = askDiscard || leaving

  const focusOn = useRef<HTMLButtonElement | null>(null)
  useEffect(() => {
    if (asking) focusOn.current?.focus()
  }, [asking])

  // Registered once, so it reads `dirtyNow`: a closure over `dirty` would always answer false.
  const guard = useContext(LeaveGuardContext)
  useEffect(() => {
    if (!guard) return
    guard.current = (go) => {
      if (!dirtyNow.current) return false
      setLogoutVia(() => go)
      return true
    }
    return () => {
      guard.current = null
    }
  }, [guard])

  return {
    asking,
    leaving,
    focusOn,
    leave: (go) => {
      if (!dirty) return go()
      setExitVia(() => go)
      setAskDiscard(true)
    },
    keep: () => {
      setAskDiscard(false)
      setLogoutVia(null)
      setExitVia(null)
      if (blocker.state === 'blocked') blocker.reset()
    },
    release: (go) => {
      released.current = true
      go()
    },
    discard: () => {
      released.current = true
      setAskDiscard(false)
      setLogoutVia(null)
      setExitVia(null)
      if (blocker.state === 'blocked') blocker.proceed()
      else if (logoutVia) logoutVia()
      else exitVia?.()
    },
  }
}

/**
 * Tells the pane holding a form whether it has unsaved changes, for its leave guard. A save in
 * flight loses nothing, so the form passes false then; closing it reports false too.
 */
export function useReportUnsaved(
  unsaved: boolean,
  report: ((unsaved: boolean) => void) | undefined,
): void {
  const latest = useRef(report)
  latest.current = report
  useEffect(() => latest.current?.(unsaved), [unsaved])
  useEffect(() => () => latest.current?.(false), [])
}
