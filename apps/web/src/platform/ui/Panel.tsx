import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { HANG } from './hang'

/**
 * A block of a page, with its heading. `section` has no box at all; `tile` is a card on the
 * Workbench's desk, whose step from desk to sheet is its only edge.
 */
export function Panel({
  label,
  to,
  action,
  tabs,
  children,
  variant = 'section',
  hang = false,
  className = '',
}: {
  /** The panel's accessible name and its visible heading. */
  label: string
  /** The block's page: the heading becomes the link there, rather than a "See all" beside it. */
  to?: string | undefined
  /** A control that belongs to the panel as a whole, pushed to the end of the heading row. */
  action?: ReactNode
  /** The block's views, as tabs. Fewer than two draws nothing. */
  tabs?: ReactNode
  children: ReactNode
  variant?: 'section' | 'tile'
  /** A section of rows: the heading hangs on the rows' thread and the body is flush. */
  hang?: boolean
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
          variant === 'tile' ? 'px-4 pt-3.5' : hang ? `${HANG} pt-1 pr-2` : 'px-2 pt-1'
        }`}
      >
        <h2 className="text-base font-semibold text-ink">
          {to ? (
            <Link to={to} className="underline-offset-[3px] hover:underline">
              {label}
            </Link>
          ) : (
            label
          )}
        </h2>
        {tabs && <span className="ml-auto flex items-center">{tabs}</span>}
        {action && (
          <span className={tabs ? 'flex items-center' : 'ml-auto flex items-center'}>{action}</span>
        )}
      </div>
      <div className={`min-w-0 pt-0.5 pb-3 ${hang ? '' : 'px-1 sm:px-2'}`}>{children}</div>
    </section>
  )
}

/** A panel's one quiet empty line. `hang` puts it on the titles' edge. */
export function PanelEmpty({ children, hang = false }: { children: ReactNode; hang?: boolean }) {
  return (
    <p className={`py-1.5 text-sm text-ink-subtle ${hang ? `${HANG} pl-[17px]` : 'px-2'}`}>
      {children}
    </p>
  )
}
