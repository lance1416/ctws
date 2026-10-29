import { idFrom, meetingId, type MeetingOccurrence } from '@ctws/contracts'
import { clockTime } from '@ctws/core/clock'
import { addDays } from '@ctws/core/day'
import { linkWords } from '@ctws/core'
import { useQuery } from '@tanstack/react-query'
import { Link, NavLink, useParams, useSearchParams } from 'react-router-dom'
import { MONTHS, monthDay, weekdayOf, ymd } from '../../../platform/time/dates'
import { useNow } from '../../../platform/time/useNow'
import { BackIcon } from '../../../platform/ui/icons'
import { ICON_BUTTON } from '../../../platform/ui/buttonStyles'
import { useAccountToday, useTimeZone } from '../../../shell/auth'
import { earlierQuery, meetingsQuery, seriesNotesQuery, seriesQuery } from '../api'
import { MEETINGS_ID } from '../logic/id'
import { nextOfEach } from '../logic/nextOfEach'
import { occurrenceTo } from './EarlierInSeries'

/** How far either way the sidebar's two halves reach. */
const WINDOW_DAYS = 31

const ROW =
  'mx-1.5 grid min-h-11 grid-cols-[3.25rem_minmax(0,1fr)] items-center gap-x-2.5 rounded-control px-2 py-1.5 hover:bg-hover'

/**
 * The Meetings sidebar's list (FR-067, artboards 16 and 17): what is coming, each series at its
 * next, and what was held lately, each at its latest. On a meeting's page, `?list=series` turns it
 * into that series, every occurrence by month (FR-069).
 */
export function MeetingsSidebar() {
  const [params] = useSearchParams()
  const { id } = useParams()
  if (params.get('list') === 'series' && id) return <Series id={id} />
  return <Everything />
}

function Everything() {
  const zone = useTimeZone()
  const now = useNow()
  const today = ymd(now, zone)
  const [params] = useSearchParams()
  const at = params.get('at')
  const ahead = useQuery(meetingsQuery({ from: today, to: addDays(today, WINDOW_DAYS) }))
  const behind = useQuery(meetingsQuery({ from: addDays(today, -WINDOW_DAYS), to: today }))
  const coming = nextOfEach(ahead.data ?? [], now).filter((m) => new Date(m.endsAt) > now)
  const latest = new Map<string, MeetingOccurrence>()
  for (const m of behind.data ?? [])
    if (new Date(m.endsAt) <= now) {
      const held = latest.get(m.meetingId)
      if (!held || held.startsAt < m.startsAt) latest.set(m.meetingId, m)
    }
  const past = [...latest.values()].sort((a, b) => b.startsAt.localeCompare(a.startsAt))
  const active = (m: MeetingOccurrence) => at === m.recurrenceId
  return (
    <nav
      aria-label="Meetings"
      className="flex min-h-0 flex-1 flex-col overflow-y-auto pb-2 *:shrink-0"
    >
      <section aria-label="Coming">
        <h3 className="px-3.5 pt-1 pb-1 text-meta text-muted">Coming</h3>
        <ul className="flex flex-col gap-px">
          {coming.map((m) => {
            const start = new Date(m.startsAt)
            const day = ymd(start, zone)
            return (
              <li key={m.meetingId} data-meeting-row={m.meetingId}>
                <NavLink
                  to={occurrenceTo(m)}
                  className={() => `${ROW} ${active(m) ? 'bg-select' : ''}`}
                >
                  <span className="flex flex-col font-mono text-meta leading-4 tabular-nums">
                    <span className="text-meeting-t">
                      {day <= addDays(today, 6) ? weekdayOf(day, true) : monthDay(day)}
                    </span>
                    <span className="text-muted">{clockTime(start, zone)}</span>
                  </span>
                  <span className="truncate text-ui text-ink">{m.title}</span>
                </NavLink>
              </li>
            )
          })}
        </ul>
      </section>
      <section aria-label="Past" className="mt-2">
        <h3 className="px-3.5 pt-1 pb-1 text-meta text-muted">Past</h3>
        <ul className="flex flex-col gap-px">
          {past.map((m) => (
            <li key={m.meetingId} data-meeting-row={m.meetingId}>
              <NavLink
                to={occurrenceTo(m)}
                className={() => `${ROW} ${active(m) ? 'bg-select' : ''}`}
              >
                <span className="font-mono text-meta text-muted tabular-nums">
                  {monthDay(ymd(new Date(m.startsAt), zone))}
                </span>
                <span className="truncate text-ui text-muted">{m.title}</span>
              </NavLink>
            </li>
          ))}
        </ul>
      </section>
    </nav>
  )
}

/** One series in full (FR-069): its next one, then every one held, by month, each with its note. */
function Series({ id }: { id: string }) {
  const today = useAccountToday()
  const series = idFrom(meetingId, id)
  const [params] = useSearchParams()
  const next = useQuery(seriesQuery(series, today))
  const earlier = useQuery(earlierQuery(series, today))
  const notes = useQuery(seriesNotesQuery(series))
  const at = params.get('at')
  const rows = [
    ...(next.data && next.data.startsLocal.slice(0, 10) >= today ? [next.data] : []),
    ...(earlier.data ?? []),
  ]
  const months = new Map<string, MeetingOccurrence[]>()
  for (const o of rows) {
    const key = o.startsLocal.slice(0, 7)
    months.set(key, [...(months.get(key) ?? []), o])
  }
  const first = (o: MeetingOccurrence) => {
    const body = notes.data?.find((n) => n.anchor?.occurrenceId === o.recurrenceId)?.body
    return body ? (linkWords(body.replace(/^#+\s+/gm, '')).split(/(?<=[.!?。])\s/)[0] ?? '') : ''
  }
  const title = next.data?.title ?? earlier.data?.[0]?.title ?? ''
  return (
    <nav
      aria-label={`${title} series`}
      className="flex min-h-0 flex-1 flex-col overflow-y-auto pb-2 *:shrink-0"
    >
      <div className="mx-1.5 mb-1 flex h-8 items-center gap-1.5">
        <Link
          to={at ? `/${MEETINGS_ID}/${id}?at=${encodeURIComponent(at)}` : `/${MEETINGS_ID}`}
          aria-label="All meetings"
          className={ICON_BUTTON}
        >
          <BackIcon size={16} aria-hidden="true" />
        </Link>
        <span className="flex-1 truncate text-ui font-medium text-ink">{title}</span>
        <span className="pr-1.5 text-meta text-subtle tabular-nums">{rows.length}</span>
      </div>
      {[...months].map(([month, list]) => (
        <section key={month} aria-label={MONTH_NAMES[Number(month.slice(5, 7)) - 1]}>
          <h3 className="px-3.5 pt-2 pb-1 text-meta text-muted">
            {MONTH_NAMES[Number(month.slice(5, 7)) - 1]}
            {month.slice(0, 4) !== today.slice(0, 4) ? ` ${month.slice(0, 4)}` : ''}
          </h3>
          <ul className="flex flex-col gap-px">
            {list.map((o) => (
              <li key={o.recurrenceId}>
                <NavLink
                  to={`${occurrenceTo(o)}&list=series`}
                  className={() => `${ROW} ${at === o.recurrenceId ? 'bg-select' : ''}`}
                >
                  <span
                    className={`font-mono text-meta tabular-nums ${o === rows[0] && o.startsLocal.slice(0, 10) >= today ? 'text-meeting-t' : 'text-muted'}`}
                  >
                    {MONTHS[Number(o.startsLocal.slice(5, 7)) - 1]}{' '}
                    {Number(o.startsLocal.slice(8, 10))}
                  </span>
                  <span className="line-clamp-2 text-ui text-ink">
                    {o === rows[0] && o.startsLocal.slice(0, 10) >= today
                      ? 'Next'
                      : first(o) || 'No notes'}
                  </span>
                </NavLink>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </nav>
  )
}

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]
