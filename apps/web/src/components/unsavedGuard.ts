import { useContext, useEffect, useRef, useState } from 'react'
import { useBlocker } from 'react-router-dom'
import { LeaveGuardContext } from './leaveGuard'

/**
 * THREE WAYS TO LOSE A FORM, ONE PROMPT.
 *
 * A pane with unsaved edits can be left by closing it, by navigating away (the router blocker
 * catches the browser's back button too), or by logging out -- which is not a navigation at all:
 * it clears the session and the layout swaps the whole page, so the layout asks the pane first
 * through `LeaveGuardContext`.
 *
 * The question is asked IN THE PANE. A browser `confirm()` would block the automation this app is
 * tested with, and without any question the typing is lost without a word.
 */
export type UnsavedGuard = {
  /** True while the person is being asked whether to discard. */
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
}

export function useUnsavedGuard(dirty: boolean, onLeave: () => void): UnsavedGuard {
  const [askDiscard, setAskDiscard] = useState(false)
  const [logoutVia, setLogoutVia] = useState<(() => void) | null>(null)
  const [exitVia, setExitVia] = useState<(() => void) | null>(null)
  // Read through refs, so the router asks the CURRENT answer at the moment it navigates.
  const dirtyNow = useRef(dirty)
  dirtyNow.current = dirty
  /**
   * Set once the person has said Discard: the way out they chose may itself be a navigation (a
   * task's sheet closing drops `?task` from the address), and blocking it with the form still
   * dirty would ask the question they have just answered.
   */
  const released = useRef(false)
  const blocker = useBlocker(() => dirtyNow.current && !released.current)
  const leaving = blocker.state === 'blocked' || logoutVia !== null
  const asking = askDiscard || leaving

  const focusOn = useRef<HTMLButtonElement | null>(null)
  useEffect(() => {
    if (asking) focusOn.current?.focus()
  }, [asking])

  // The layout registers its handler ONCE, so it too reads `dirtyNow`: a closure over `dirty`
  // would answer with whatever it was at registration time, which is always false.
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
    discard: () => {
      released.current = true
      if (blocker.state === 'blocked') blocker.proceed()
      else if (logoutVia) logoutVia()
      else if (exitVia) exitVia()
      else onLeave()
    },
  }
}
