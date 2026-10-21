import type { ReactNode } from 'react'
import { PanelEmpty } from '../../platform/ui/Panel'
import { HANG } from '../../platform/ui/hang'

/** A heading, then its rows, and no box. The heading hangs on the titles' edge. */
export function DaySection({
  label,
  count,
  action,
  children,
  className = '',
}: {
  label: string
  /** Zero and undefined both draw nothing. */
  count?: number | undefined
  /** A control for the whole section, at the end of the heading row. */
  action?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section aria-label={label} data-panel={label} className={`min-w-0 ${className}`}>
      <div className={`mb-1.5 ${HANG} flex min-w-0 items-baseline gap-2`}>
        <h2 className="text-prose font-medium text-ink">{label}</h2>
        {count !== undefined && count > 0 && (
          <span data-count className="text-ui text-subtle tabular-nums">
            {count}
          </span>
        )}
        {action && <span className="ml-auto flex items-center">{action}</span>}
      </div>
      {children}
    </section>
  )
}

export function DayEmpty({ children }: { children: ReactNode }) {
  return <PanelEmpty hang>{children}</PanelEmpty>
}
