import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

/**
 * A panel: one question, one block.
 *
 * It is a SHELL piece, not the task module's, for the same reason `EmptyState` is: a second
 * module's block has to look like this one or the page stops being one surface.
 *
 * TWO KINDS, and neither is a card:
 * - `section`, the default: a part of a page. No box at all -- no fill, edge, radius or shadow.
 *   Its heading is the only thing that says where it starts, which is why every block on a page
 *   no longer looks the same as every other.
 * - `tile`: a card on the Workbench's desk. Paper on the desk, rounded, and still no edge or
 *   shadow -- the step from desk to sheet is the edge.
 */
export function Panel({
  label,
  count,
  heading,
  to,
  action,
  tabs,
  children,
  variant = 'section',
  className = '',
}: {
  /** The panel's accessible name, and its visible heading unless `heading` replaces it. */
  label: string
  /** The number beside the heading. Zero and undefined both render nothing: "0" is not news. */
  count?: number | undefined
  /** Replaces the default <h2>, for the one panel whose heading is the page's <h1>. */
  heading?: ReactNode
  /** The block's page: the heading becomes the link there, rather than a "See all" beside it. */
  to?: string | undefined
  /** A control that belongs to the panel as a whole, pushed to the end of the heading row. */
  action?: ReactNode
  /** The block's views, as tabs. Fewer than two draws nothing. */
  tabs?: ReactNode
  children: ReactNode
  variant?: 'section' | 'tile'
  className?: string
}) {
  return (
    <section
      aria-label={label}
      data-panel={label}
      className={`flex min-w-0 flex-col ${variant === 'tile' ? 'rounded-[10px] bg-sheet' : ''} ${className}`}
    >
      <div
        className={`flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1 pb-1.5 ${
          variant === 'tile' ? 'px-4 pt-3.5' : 'px-2 pt-1'
        }`}
      >
        {heading ?? (
          <h2 className="text-base font-semibold text-ink">
            {to ? (
              <Link to={to} className="underline-offset-[3px] hover:underline">
                {label}
              </Link>
            ) : (
              label
            )}
          </h2>
        )}
        {count !== undefined && count > 0 && (
          <span data-count className="text-sm text-ink-subtle tabular-nums">
            {count}
          </span>
        )}
        {tabs && <span className="ml-auto flex items-center">{tabs}</span>}
        {action && (
          <span className={tabs ? 'flex items-center' : 'ml-auto flex items-center'}>{action}</span>
        )}
      </div>
      {/* The body's gutter halves on a phone: at 375 the panel's padding is paid on TOP of the
          page's own, and a deep tree row has only what is left after the indent, the handle, the
          chevron, the marker and the two row buttons. Four pixels a side there is the difference
          between a title and an ellipsis. */}
      <div className="min-w-0 px-1 pt-0.5 pb-3 sm:px-2">{children}</div>
    </section>
  )
}

/** What a panel says when it has nothing in it. One quiet line; never an apology or a graphic. */
export function PanelEmpty({ children }: { children: ReactNode }) {
  return <p className="px-2 py-1.5 text-sm text-ink-subtle">{children}</p>
}
