import type { BirthdayListRow, Circle } from '@ctws/contracts'
import { Link } from 'react-router-dom'
import { countdownPhrase, shortDay } from '../dueAt'

/**
 * ONE BIRTHDAY, shared by the page and the workbench card.
 *
 * The order is who → how old → which day → how far off, with the distance against the date:
 * `Projects.tsx` records what the other arrangement cost ("at 64ch the count sat ~450px from the
 * short project name it belonged to").
 *
 * COLOUR ONLY FOR TODAY. A birthday is neither a category nor a deadline, and the one thing worth
 * a colour here is that it is happening now.
 */
export function BirthdayRow({ row, today }: { row: BirthdayListRow; today: string }) {
  return (
    <li
      data-birthday-row={row.personId}
      className="flex h-11 min-w-0 items-center gap-2.5 rounded-lg px-2 hover:bg-hover"
    >
      <Link
        to={`/people/${row.personId}`}
        className="min-w-0 shrink truncate rounded text-base text-ink hover:underline"
      >
        {row.name}
      </Link>
      {row.turns === null ? (
        <span className="shrink-0 text-sm text-ink-subtle">year unknown</span>
      ) : (
        <span className="shrink-0 text-sm text-ink-muted">turns {row.turns}</span>
      )}
      {row.circle && (
        <span className="shrink-0 text-xs text-ink-subtle">{CIRCLE_LABELS[row.circle]}</span>
      )}
      <span className="flex-1" />
      {row.lunarDate && (
        <span className="min-w-0 shrink truncate text-xs text-ink-subtle">{row.lunarDate}</span>
      )}
      {/* The year had no such day and it was moved. The sentence that explains it is on the
          person's own page, which has room for it. */}
      {row.kept.length > 0 && <span className="shrink-0 text-xs text-ink-subtle">moved</span>}
      <span className="shrink-0 text-sm text-ink-muted tabular-nums">
        {shortDay(row.day, today)}
      </span>
      <span
        className={`w-20 shrink-0 text-right text-sm tabular-nums ${
          row.inDays === 0 ? 'font-semibold text-deadline' : 'text-ink-muted'
        }`}
      >
        {countdownPhrase(row.inDays)}
      </span>
    </li>
  )
}

/** The UI is English and a circle is an enum rather than something a person typed, so it has one. */
export const CIRCLE_LABELS: Record<Circle, string> = {
  family: 'Family',
  friend: 'Friends',
  work: 'Work',
}
