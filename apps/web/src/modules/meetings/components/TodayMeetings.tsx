import { occurrenceKey } from '@ctws/contracts'
import { clockTime } from '@ctws/core/clock'
import { useQuery } from '@tanstack/react-query'
import { ymd } from '../../../platform/time/dates'
import { useNow } from '../../../platform/time/useNow'
import { PanelEmpty } from '../../../platform/ui/Panel'
import { useTimeZone } from '../../../shell/auth'
import { useProjectRail } from '../../../shell/projects'
import { ProjectRail } from '../../../shell/rows'
import { meetingsQuery } from '../api'
import { useTodayCount } from '../hooks/useTodaysMeetings'
import { useOpenOccurrence } from '../hooks/useOpenOccurrence'
import { OccurrencePane } from './OccurrencePane'

/** The hours the Workbench's day line spans. */
const LINE_FROM = 8
const LINE_TO = 22
/** Past this share of the line (%), the now label sits left of its mark so it fits on a phone. */
const LABEL_FLIP = 80

/**
 * Today as a line from 08:00 to 22:00, each meeting a block and a mark for now, then the meetings
 * as rows. A meeting outside those hours is still in the rows and in the line's spoken name.
 */
export function TodayMeetings() {
  const accountZone = useTimeZone()
  const now = useNow()
  const day = ymd(now, accountZone)
  const meetings = useQuery(meetingsQuery({ from: day, to: day }))
  const rows = meetings.data ?? []
  // Moved to another day, it is no longer among the rows and is read on its own.
  const open = useOpenOccurrence({
    where: 'over',
    listed: ({ meetingId, at }) =>
      rows.find((m) => m.meetingId === meetingId && m.recurrenceId === at),
    ready: meetings.isSuccess,
    today: day,
  })
  const pane = <OccurrencePane open={open} />
  const rail = useProjectRail()

  if (meetings.isError) {
    return (
      <p role="alert" className="px-2 py-1.5 text-sm text-danger">
        Couldn't load today's meetings
      </p>
    )
  }
  // Nothing until loaded: a line drawn before then would announce an empty day.
  if (!meetings.isSuccess) return null
  // The pane too: the one meeting of the day may have just been moved off it.
  if (rows.length === 0) {
    return (
      <>
        <PanelEmpty>No meetings today</PanelEmpty>
        {pane}
      </>
    )
  }

  const at = (d: Date) => clockTime(d, accountZone)
  const minutes = (d: Date) => {
    const [h, m] = at(d).split(':').map(Number) as [number, number]
    return h * 60 + m
  }
  const pct = (min: number) => ((min - LINE_FROM * 60) / ((LINE_TO - LINE_FROM) * 60)) * 100
  const within = (min: number) => min >= LINE_FROM * 60 && min <= LINE_TO * 60
  // Minutes of today; a meeting that ends tomorrow (its end reads earlier) runs to midnight.
  const span = (m: (typeof rows)[number]) => {
    const from = minutes(new Date(m.startsAt))
    const to = minutes(new Date(m.endsAt))
    return { from, to: to > from ? to : 24 * 60 }
  }
  // On the line means overlapping its hours: 07:30 to 09:00 shows from 08:00.
  const overlaps = (m: (typeof rows)[number]) => {
    const { from, to } = span(m)
    return from < LINE_TO * 60 && to > LINE_FROM * 60
  }
  const onLine = rows.filter(overlaps)
  const offLine = rows.filter((m) => !overlaps(m))
  const said = (list: typeof rows) =>
    list.map((m) => `${m.title} at ${at(new Date(m.startsAt))}`).join(', ')
  const name = [
    `Today from ${String(LINE_FROM).padStart(2, '0')}:00 to ${LINE_TO}:00`,
    onLine.length > 0 ? `: ${said(onLine)}.` : ': nothing.',
    offLine.length > 0 ? ` Outside those hours: ${said(offLine)}.` : '',
    ` It is ${at(now)}.`,
  ].join('')
  const nowMin = minutes(now)

  return (
    <>
      {/* To a screen reader the line is one sentence; the rows below are what to press. */}
      <div role="img" aria-label={name} className="relative mx-1 mb-2 h-[54px]">
        <span className="absolute inset-x-0 top-[30px] h-px bg-rule" />
        {Array.from({ length: (LINE_TO - LINE_FROM) / 2 + 1 }, (_, i) => LINE_FROM + i * 2).map(
          (h) => (
            <span key={h}>
              <span
                className="absolute top-[27px] h-[7px] w-px bg-rule-strong"
                style={{ left: `${pct(h * 60)}%` }}
              />
              <span
                className="absolute top-9 -translate-x-1/2 text-xs text-ink-subtle tabular-nums"
                style={{ left: `${pct(h * 60)}%` }}
              >
                {String(h).padStart(2, '0')}
              </span>
            </span>
          ),
        )}
        {onLine.map((m) => {
          const from = Math.max(span(m).from, LINE_FROM * 60)
          const to = Math.min(span(m).to, LINE_TO * 60)
          const past = new Date(m.endsAt).getTime() <= now.getTime()
          return (
            <span
              key={occurrenceKey(m)}
              data-line-meeting={m.title}
              className={`absolute top-3 h-[18px] bg-select ${past ? 'opacity-55' : ''}`}
              style={{ left: `${pct(from)}%`, width: `${Math.max(pct(to) - pct(from), 1)}%` }}
            >
              <span
                className={`absolute inset-x-0 top-0 h-0.5 ${m.projectId ? rail(m.projectId) : 'bg-ink-subtle'}`}
              />
            </span>
          )
        })}
        {within(nowMin) && (
          <>
            <span
              className="absolute top-0 bottom-[18px] -ml-px w-0.5 bg-ink"
              style={{ left: `${pct(nowMin)}%` }}
            />
            <span
              className={`absolute -top-1 text-xs font-semibold tabular-nums ${
                pct(nowMin) > LABEL_FLIP ? '-ml-1.5 -translate-x-full' : 'ml-1.5'
              }`}
              style={{ left: `${pct(nowMin)}%` }}
            >
              {at(now)}
            </span>
          </>
        )}
      </div>
      <ul className="min-w-0">
        {rows.map((m) => {
          const past = new Date(m.endsAt).getTime() <= now.getTime()
          return (
            <li
              key={occurrenceKey(m)}
              className="flex min-h-[38px] min-w-0 items-stretch hover:bg-hover"
            >
              <span
                className={`flex w-16 shrink-0 items-center justify-end pr-3 text-sm tabular-nums ${
                  past ? 'text-ink-subtle' : 'text-ink-muted'
                }`}
              >
                {at(new Date(m.startsAt))}
              </span>
              <ProjectRail projectId={m.projectId} />
              <button
                type="button"
                onClick={() => open.show(m)}
                className={`min-w-0 flex-1 truncate pl-3 text-left ${past ? 'text-ink-subtle' : 'text-ink'}`}
              >
                {m.title}
              </button>
              {/* The project by name, so its colour is never the only signal, then who attends. */}
              {(m.projectName || m.attendees.length > 0) && (
                <span className="flex max-w-[50%] shrink-0 items-center truncate pl-3 text-sm text-ink-subtle">
                  {[m.projectName, m.attendees.map((p) => p.name).join(', ')]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
              )}
            </li>
          )
        })}
      </ul>
      {pane}
    </>
  )
}

export function MeetingsAside() {
  const count = useTodayCount()
  return count && <span className="text-sm text-ink-subtle">{count}</span>
}
