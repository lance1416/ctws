import type { BirthdayListRow } from '@ctws/contracts'
import { Link } from 'react-router-dom'
import { countdownPhrase, fullDay, MONTHS } from '../../../platform/time/dates'
import { HANG_WIDTH } from '../../../platform/ui/hang'
import { CIRCLE_LABELS } from '../labels'
import { BODY_GUTTER, ProjectRail } from '../../../shell/rows'

/**
 * A birthday on the app's row: the day in the margin, then who, how old and how far off. The thread
 * stays neutral, since this list does not know their projects; only today's gets a colour.
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
        {/* The year had no such day, so it was moved; the person's page explains. */}
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

/** A row margin's next birthday: month and day only, since the next is always within a year. */
export function BirthdayLead({ next }: { next: { day: string; inDays: number } | null }) {
  const [, m, d] = next ? next.day.split('-').map(Number) : []
  return (
    <span
      data-birthday-lead
      // A 2px gap on a phone: "May 28" with its cake is 59px there, and the margin leaves 52.
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
