import type { ReactNode } from 'react'

/**
 * What a screen says when it has nothing on it.
 *
 * An empty screen is the one moment the interface has the reader's whole attention and nothing to
 * compete with, so it is worth more than a shrug. Each one says what this screen is FOR -- which
 * is the thing a newcomer cannot deduce from an empty list -- and offers the single action that
 * would fill it. No apology ("抱歉"), no exclamation, no illustration.
 *
 * Left-aligned like everything else in this app: a centred block in a left-aligned workbench
 * announces itself as a different kind of page, and it is not one.
 */
export function EmptyState({
  title,
  hint,
  action,
}: {
  /** One line, the state itself. Plain, present tense. */
  title: string
  /** One line, what this screen is for. */
  hint: string
  /** The one action that fills it. */
  action?: ReactNode
}) {
  return (
    <div className="mt-8 max-w-[44ch]">
      <p className="text-fg">{title}</p>
      <p className="mt-1 text-sm text-fg-muted">{hint}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

/** The one action an empty state offers, as a button. Quiet: it is an invitation, not a demand. */
export const EMPTY_ACTION =
  'inline-flex h-9 items-center rounded-md border border-border-strong px-3 text-sm text-fg hover:bg-surface-sunken'
