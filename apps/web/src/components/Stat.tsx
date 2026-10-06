import type { ReactNode } from 'react'

/**
 * ONE NUMBER ON A BANNER: what it is, and how much of it there is.
 *
 * A shell generic piece, beside `Panel` and `EmptyState`, for the same reason those are: the
 * numbers in a project header come from whichever module is reporting them (the task module
 * today), and if each module set its own they would not line up in one banner.
 *
 * NEVER A RATIO (workbench spec §5). There is no `of` or `total` prop and no bar: rollup is M3
 * and nothing writes `manual_progress`, so a proportion here would be a number the backend cannot
 * cash. A `Stat` holds a count or a date phrase -- a thing that can MOVE -- and nothing else.
 *
 * The label is above the number rather than beside it: four stats in a row read as a row of
 * numbers that way, and as a sentence the other way.
 */
export function Stat({
  label,
  value,
  tone = 'fg',
}: {
  label: string
  /** A count, or a short phrase ("今天", "还没有"). Never a percentage. */
  value: ReactNode
  /**
   * `missed` for a count of things whose deadline has gone -- the same token the rows paint an
   * overdue date in, so one meaning keeps one colour. Everything else is plain body colour:
   * `plan` and `deadline` mean particular things about DATES and a count must not borrow them.
   */
  tone?: 'fg' | 'missed'
}) {
  return (
    <div data-stat={label} className="min-w-0">
      <dt className="text-xs whitespace-nowrap text-fg-subtle">{label}</dt>
      <dd
        className={`text-xl leading-tight font-semibold tabular-nums ${
          tone === 'missed' ? 'text-missed' : 'text-fg'
        }`}
      >
        {value}
      </dd>
    </div>
  )
}

/** The row the stats sit in. A `<dl>`, because each one really is a term and its value. */
export function StatRow({ children }: { children: ReactNode }) {
  return <dl className="flex min-w-0 flex-wrap items-end gap-x-7 gap-y-2">{children}</dl>
}
