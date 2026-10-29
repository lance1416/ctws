import type { ReactNode } from 'react'

/**
 * ONE OF A PHONE PAGE'S SECTIONS (artboard 25): its name and count above, the rows in a card under
 * it. `tone` colours the head where the section is a warning (Overdue).
 */
export function PhoneSection({
  icon,
  title,
  count,
  tone = 'text-muted',
  label,
  foot,
  children,
}: {
  /** Its mark, 14 across, before the name. */
  icon: ReactNode
  title: string
  count?: number | string
  tone?: string
  /** Its name for a screen reader, when the title alone is not it. */
  label?: string
  /** Under the rows, inside the card: a block's "All N" (FR-015). */
  foot?: ReactNode
  children: ReactNode
}) {
  return (
    <section aria-label={label ?? title} className="flex flex-col gap-1.5">
      <h2 className={`flex items-center gap-1.5 px-1 text-ui font-medium ${tone}`}>
        <span aria-hidden="true" className="flex">
          {icon}
        </span>
        {title}
        {count !== undefined && <span className="font-normal tabular-nums">{count}</span>}
      </h2>
      <div className="overflow-hidden rounded-phone-card border border-line bg-panel">
        <ul className="py-1">{children}</ul>
        {foot}
      </div>
    </section>
  )
}
