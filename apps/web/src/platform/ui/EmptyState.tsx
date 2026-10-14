import type { ReactNode } from 'react'
import { BUTTON } from './buttonStyles'
import { HANG } from './hang'

/** What a screen says when it has nothing on it: one line, and an action only where one is obvious. */
export function EmptyState({
  title,
  action,
  hang = false,
}: {
  /** The state itself, plain and present tense. */
  title: string
  /** The one action that fills it. */
  action?: ReactNode
  /** On a page of rows: on the margin's edge, where the page's title and its headings hang. */
  hang?: boolean
}) {
  return (
    <div className={`mt-8 max-w-[44ch] ${hang ? HANG : ''}`}>
      <p className="text-ink">{title}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

/** The one action an empty state offers, as a button: an invitation, not a demand. */
export const EMPTY_ACTION = `inline-flex items-center ${BUTTON.secondary}`
