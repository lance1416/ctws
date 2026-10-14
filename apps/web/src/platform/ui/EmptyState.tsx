import type { ReactNode } from 'react'
import { BUTTON } from './buttonStyles'

/**
 * What a screen says when it has nothing on it: ONE LINE, and an action only where there is a
 * single obvious one.
 *
 * NO SECOND LINE EXPLAINING WHAT THE SCREEN IS FOR. That is a manual, not an interface: the one
 * person using this built the screens, and a sentence teaching them what their own page does
 * reads as filler.
 *
 * Left-aligned like everything else here: a centred block announces itself as a different kind of
 * page, and it is not one.
 */
export function EmptyState({
  title,
  hint,
  action,
  hang = false,
}: {
  /** One line, the state itself. Plain, present tense. */
  title: string
  /** A second line, only when it says something the first cannot. Usually there is none. */
  hint?: string
  /** The one action that fills it. */
  action?: ReactNode
  /** On a page of rows: on the margin's edge, where the page's title and its headings hang. */
  hang?: boolean
}) {
  return (
    <div className={`mt-8 max-w-[44ch] ${hang ? 'ml-15 sm:ml-18' : ''}`}>
      <p className="text-ink">{title}</p>
      {hint && <p className="mt-1 text-sm text-ink-muted">{hint}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

/** The one action an empty state offers, as a button. Quiet: it is an invitation, not a demand. */
export const EMPTY_ACTION = `inline-flex items-center ${BUTTON.secondary}`
