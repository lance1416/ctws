import type { ReactNode } from 'react'
import { PanelEmpty } from './Panel'

/**
 * A SECTION OF A DAY: a heading, then its rows, and no box.
 *
 * The heading hangs where the thread hangs -- after the margin, not over it -- so on a page of
 * rows the eye runs down two edges: the margin's words on the left, the headings and titles on
 * the right. That alignment is the whole structure; a box round each section would only repeat it.
 */
export function DaySection({
  label,
  count,
  action,
  heading,
  children,
  className = '',
}: {
  /** The section's accessible name, and its visible heading unless `heading` replaces it. */
  label: string
  /** The number beside the heading. Zero and undefined both draw nothing. */
  count?: number | undefined
  /** A control for the section as a whole, at the end of the heading row. */
  action?: ReactNode
  heading?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section aria-label={label} data-panel={label} className={`min-w-0 ${className}`}>
      <div className="mb-1.5 ml-15 flex min-w-0 items-baseline gap-2 sm:ml-18">
        {heading ?? <h2 className="text-base font-semibold text-ink">{label}</h2>}
        {count !== undefined && count > 0 && (
          <span data-count className="text-sm text-ink-subtle tabular-nums">
            {count}
          </span>
        )}
        {action && <span className="ml-auto flex items-center">{action}</span>}
      </div>
      {children}
    </section>
  )
}

/** What a section says when it has nothing in it: one quiet line, on the titles' edge. */
export function DayEmpty({ children }: { children: ReactNode }) {
  return <PanelEmpty hang>{children}</PanelEmpty>
}
