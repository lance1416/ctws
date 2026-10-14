import { createContext, type MutableRefObject } from 'react'

/**
 * How the open task panel gets a say before the app throws it away. A router blocker covers
 * navigation, but "Log out" is not a navigation: it clears the session and the layout swaps the
 * whole page for the login redirect, unmounting the panel with it. So the layout asks the panel
 * first. The handler returns true when it took over (the panel is dirty and will ask the person),
 * and then runs `go` only if they choose to discard; false means there was nothing to lose.
 */
export type LeaveGuard = MutableRefObject<((go: () => void) => boolean) | null>
export const LeaveGuardContext = createContext<LeaveGuard | null>(null)
