import type { ReactNode } from 'react'
import { useShortcutsEnabled } from '../keyboard/enabled'

/**
 * A key, shown beside what it does -- only where pressing it would work.
 *
 * Not with the single-key shortcuts switched off, where it is a promise the page does not keep.
 * And not below 1024, where the app takes the screen for a touch one: the tab bar stands in for
 * the keys there, and the header drops its key list at the same width.
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
