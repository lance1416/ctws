import type { BirthdayListRow, Circle } from '@ctws/contracts'
import { Link } from 'react-router-dom'
import { countdownPhrase, fullDay, MONTHS } from '../../../platform/time/dates'
import { HANG_WIDTH } from '../../../platform/ui/hang'
import { BODY_GUTTER, ProjectRail } from '../../../shell/rows/RowParts'

/**
 * ONE BIRTHDAY, on the app's row: the day in the margin, then who, how old, and how far off at the
 * far end. The day and the distance are on one line, read as the row's two ends, the way a task's
 * date and its lateness are.
 *
 * No thread colour: a birthday is a person's, not a line of work's, and this list does not know
 * their projects. The thread is the hairline's, so the rows still have the same parts at the same x.
 *
 * COLOUR ONLY FOR TODAY. A birthday is neither a category nor a deadline, and the one thing worth
 * a colour here is that it is happening now.
 */
export function BirthdayRow({ row }: { row: BirthdayListRow }) {
  return (
    <li data-birthday-row={row.personId} className="flex min-h-11 min-w-0">
      <BirthdayLead next={row} />
      <ProjectRail projectId={null} />
      <Link
        to={`/people/${row.personId}`}
        className={`flex min-w-0 flex-1 items-center gap-2.5 pr-2 pl-[var(--gutter)] hover:bg-hover ${BODY_GUTTER}`}
      >
        <span className="min-w-0 shrink truncate text-base text-ink">{row.name}</span>
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
        <span
          className={`w-20 shrink-0 text-right text-sm tabular-nums ${
            row.inDays === 0 ? 'font-semibold text-deadline' : 'text-ink-muted'
          }`}
        >
          {countdownPhrase(row.inDays)}
        </span>
      </Link>
    </li>
  )
}

/**
 * THE MARGIN OF A PERSON'S ROW: their next birthday, beside a cake -- the one date a person has.
 *
 * Month and day, never the year: the next one is always within a year, and the margin is one
 * short line. In the margin's own type and place (`RowLead`), centred on the row, because a
 * person's row is two lines and the date belongs to the whole of it. Today's is in the one colour
 * a birthday is allowed.
 */
export function BirthdayLead({ next }: { next: { day: string; inDays: number } | null }) {
  const [, m, d] = next ? next.day.split('-').map(Number) : []
  return (
    <span
      data-birthday-lead
      // The cake 2px from its date on a phone (6px up): "May 28" with its cake is 59px there, and
      // the phone's margin leaves 52 -- the rest runs into the page's gutter, half of it at most.
      className={`flex shrink-0 items-center justify-end gap-0.5 pr-2 text-sm whitespace-nowrap tabular-nums sm:gap-1.5 sm:pr-3.5 ${HANG_WIDTH} ${
        next?.inDays === 0 ? 'font-semibold text-deadline' : 'text-ink-muted'
      }`}
    >
      {next && (
        <>
          <CakeMark />
          <span className="sr-only">Birthday </span>
          <time dateTime={next.day} title={`Birthday ${fullDay(next.day)}`}>
            {MONTHS[m! - 1]} {d}
          </time>
        </>
      )}
    </span>
  )
}

/** A cake with one candle: what a birthday is, in the margin's glyph size. */
function CakeMark() {
  return (
    <svg
      data-cake
      aria-hidden="true"
      viewBox="0 0 11 12"
      width="11"
      height="12"
      className="shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.3"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M1.5 11h8M2 11V6.5h7V11M5.5 6.5V4.2M5.5 2.8c-.6-.5-.6-1.1 0-1.8.6.7.6 1.3 0 1.8z" />
    </svg>
  )
}

/** The UI is English and a circle is an enum rather than something a person typed, so it has one. */
export const CIRCLE_LABELS: Record<Circle, string> = {
  family: 'Family',
  friend: 'Friends',
  work: 'Work',
}
