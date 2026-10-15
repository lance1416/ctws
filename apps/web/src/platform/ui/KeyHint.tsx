import type { ReactNode } from 'react'
import { useShortcutsEnabled } from '../keyboard/enabled'

/**
 * A key beside what it does, only where pressing it works: not with shortcuts off, and not below
 * 1024, where the tab bar stands in for the keys.
 */
export function KeyHint({
  children,
  className,
  hidden = false,
}: {
  children: ReactNode
  className: string
  /** For a hint that repeats what the control's own name already says. */
  hidden?: boolean
}) {
  const enabled = useShortcutsEnabled()
  if (!enabled) return null
  return (
    <kbd aria-hidden={hidden || undefined} className={`max-lg:hidden ${className}`}>
      {children}
    </kbd>
  )
}
