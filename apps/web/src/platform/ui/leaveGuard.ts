import { createContext, type MutableRefObject } from 'react'

/**
 * Lets the open panel ask before Log out, which unmounts it without a navigation. The handler
 * returns true if it took over (it runs `go` only on Discard), false if there is nothing to lose.
 */
export type LeaveGuard = MutableRefObject<((go: () => void) => boolean) | null>
export const LeaveGuardContext = createContext<LeaveGuard | null>(null)
