import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { HANG } from './hang'

type Block = {
  /** The panel's accessible name and its visible heading. */
  label: string
  /** The block's page: the heading becomes the link there, rather than a "See all" beside it. */
  to?: string | undefined
  /** A control that belongs to the panel as a whole, pushed to the end of the heading row. */
  action?: ReactNode
  /** The block's views, as tabs. Fewer than two draws nothing. */
  tabs?: ReactNode
  children: ReactNode
  className?: string
}

/** A block of a page, with its heading and no box at all. */
export function Panel(props: Block) {
  return <Frame {...props} box="" head="px-2 pt-1" body="px-1 sm:px-2" />
}

/** A section of rows: the heading hangs on the rows' thread and the body is flush. */
export function RowsPanel(props: Block) {
  return <Frame {...props} box="" head={`${HANG} pt-1 pr-2`} body="" />
}

/** A card on the Workbench's desk, whose step from desk to sheet is its only edge. */
export function Tile(props: Block) {
  return <Frame {...props} box="rounded-[10px] bg-sheet" head="px-4 pt-3.5" body="px-1 sm:px-2" />
}

function Frame({
  label,
  to,
  action,
  tabs,
  children,
  className = '',
  box,
  head,
  body,
}: Block & { box: string; head: string; body: string }) {
  return (
    <section
      aria-label={label}
      data-panel={label}
      className={`flex min-w-0 flex-col ${box} ${className}`}
    >
      <div className={`flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1 pb-1.5 ${head}`}>
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
      <div className={`min-w-0 pt-0.5 pb-3 ${body}`}>{children}</div>
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
