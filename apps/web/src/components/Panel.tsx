import type { ReactNode } from 'react'

/**
 * A panel: one question, one block.
 *
 * The workbench is made of these, and their arrangement is fixed by design: there is no drag, no
 * resize and no "add panel" control, because one user has one taste and a free grid only moves the
 * design decision onto the person using the tool.
 *
 * It is a SHELL piece, not the task module's, for the same reason `EmptyState` is: a second
 * module's workbench block has to look like this one or the page stops being one surface.
 *
 * Figure and ground are done in two different ways here, which is the whole point of the token
 * pair (styles.css): in light the panel is white paper on a tinted ground with one hair of
 * shadow; in dark there is no shadow at all and the panel is simply a lighter plane than the
 * ground it sits on. `bg-surface-panel shadow-panel` says both at once.
 */
export function Panel({
  label,
  count,
  heading,
  action,
  tabs,
  children,
  className = '',
}: {
  /** The panel's accessible name, and its visible heading unless `heading` replaces it. */
  label: string
  /** The number beside the heading. Zero and undefined both render nothing: "0" is not news. */
  count?: number | undefined
  /** Replaces the default <h2>, for the one panel whose heading is the page's <h1>. */
  heading?: ReactNode
  /** A control that belongs to the panel as a whole, pushed to the end of the heading row. */
  action?: ReactNode
  /** The block's views, as tabs. Fewer than two draws nothing. */
  tabs?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section
      aria-label={label}
      data-panel={label}
      className={`flex min-w-0 flex-col rounded-xl border border-border-subtle bg-surface-panel shadow-panel ${className}`}
    >
      <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1 px-4 pt-3.5 pb-1.5">
        {heading ?? <h2 className="text-lg font-semibold text-fg">{label}</h2>}
        {count !== undefined && count > 0 && (
          <span data-count className="text-sm text-fg-subtle tabular-nums">
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
  return <p className="px-2 py-1.5 text-sm text-fg-subtle">{children}</p>
}
