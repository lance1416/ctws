import type { MeetingOccurrence } from '@ctws/contracts'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { meetingCalendarQuery, meetingsQuery, occurrenceQuery } from './api'
import { MeetingDetail } from './components/MeetingDetail'
import { Meetings } from './pages/Meetings'
import { PanelEmpty } from '../../platform/ui/Panel'
import { ProjectRail } from '../../shell/rows/RowParts'
import { useProjectRail } from '../../shell/projects/projectColor'
import { clockTime, todayIn } from '../../platform/time/dates'
import { useTimeZone } from '../../shell/auth/useMe'
import { useNow } from '../../platform/time/useNow'
import type { WorkspaceModule } from '../../shell/contract'

/**
 * Meetings: a page of its own, timed calendar entries, and a Workbench card for today. No search
 * provider: a meeting is found by its date, and a weekly title repeats many times over.
 */
const ID = 'meetings'

/**
 * The open occurrence, held as ids and looked up on each render so the pane follows the list's
 * refetch. A series has many occurrences, so the series id alone does not name one.
 */
function useOpenMeeting(pool: readonly MeetingOccurrence[]) {
  const [open, setOpen] = useState<{ meetingId: string; recurrenceId: string } | null>(null)
  const accountZone = useTimeZone()
  const found = pool.find(
    (m) => m.meetingId === open?.meetingId && m.recurrenceId === open.recurrenceId,
  )
  const pane = found ? (
    <MeetingDetail
      key={`${found.meetingId}:${found.recurrenceId}`}
      meeting={found}
      accountZone={accountZone}
      onClose={() => setOpen(null)}
      onMoved={(moved) => setOpen({ meetingId: moved.meetingId, recurrenceId: moved.recurrenceId })}
    />
  ) : null
  return { setOpen, pane }
}

function useMeetingEntries(range: { from: string; to: string }) {
  const result = useQuery(meetingCalendarQuery(range))
  return { entries: result.data ?? [], isError: result.isError }
}

/**
 * The pane for a clicked calendar entry, whose id names one occurrence of a series. A save that
 * moves it renames it, so the pane follows the name the server gives back, keeping the last one
 * on screen while it reads the new.
 */
function CalendarDetail({ id, onClose }: { id: string; onClose: () => void }) {
  const accountZone = useTimeZone()
  const [moved, setMoved] = useState<{ from: string; to: MeetingOccurrence } | null>(null)
  const [meetingId, recurrenceId] =
    moved?.from === id ? [moved.to.meetingId, moved.to.recurrenceId] : splitEntryId(id)
  const found = useQuery({
    ...occurrenceQuery(meetingId, recurrenceId),
    placeholderData: keepPreviousData,
  })
  if (!found.data) return null
  return (
    <MeetingDetail
      key={`${found.data.meetingId}:${found.data.recurrenceId}`}
      meeting={found.data}
      accountZone={accountZone}
      onClose={onClose}
      onMoved={(to) => setMoved({ from: id, to })}
    />
  )
}

/** `<series uuid>:<recurrence id>`. The uuid has a fixed length, so the split is unambiguous. */
function splitEntryId(id: string): [string, string] {
  return [id.slice(0, 36), id.slice(37)]
}

/** Today's meetings, shared by Things' count and status line. */
function useTodaysMeetings() {
  const day = todayIn(useTimeZone(), useNow())
  return useQuery(meetingsQuery({ from: day, to: day }))
}

function MeetingsTodayCount() {
  const today = useTodaysMeetings()
  if (!today.data) return null
  return <span data-count>{today.data.length} today</span>
}

function NextMeetingLine() {
  const accountZone = useTimeZone()
  const today = useTodaysMeetings()
  const next = today.data?.find((m) => new Date(m.startsAt).getTime() > Date.now())
  if (!next) return null
  const at = clockTime(accountZone).format(new Date(next.startsAt))
  return (
    <span data-status>
      Next: {next.title} at {at}
    </span>
  )
}

/** The hours the Workbench's day line spans. */
const LINE_FROM = 8
const LINE_TO = 22
/** Past this share of the line (%), the now label sits left of its mark so it fits on a phone. */
const LABEL_FLIP = 80

/**
 * Today as a line from 08:00 to 22:00, each meeting a block and a mark for now, then the meetings
 * as rows. A meeting outside those hours is still in the rows and in the line's spoken name.
 */
function TodayMeetings() {
  const accountZone = useTimeZone()
  const now = useNow()
  const day = todayIn(accountZone, now)
  const meetings = useQuery(meetingsQuery({ from: day, to: day }))
  const rows = meetings.data ?? []
  const { setOpen, pane } = useOpenMeeting(rows)
  const rail = useProjectRail()
  // `h23`, not `clockTime`'s `hour12: false`: the line reads the hour back as a number, and some
  // engines write midnight as 24 under `hour12: false`.
  const clock = new Intl.DateTimeFormat('en-US', {
    timeZone: accountZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  })

  if (meetings.isError) {
    return (
      <p role="alert" className="px-2 py-1.5 text-sm text-danger">
        Couldn't load today's meetings
      </p>
    )
  }
  // Nothing until loaded: a line drawn before then would announce an empty day.
  if (!meetings.isSuccess) return null
  if (rows.length === 0) return <PanelEmpty>No meetings today</PanelEmpty>

  const at = (d: Date) => clock.format(d)
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
              key={`${m.meetingId}:${m.recurrenceId}`}
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
              key={`${m.meetingId}:${m.recurrenceId}`}
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
                onClick={() => setOpen({ meetingId: m.meetingId, recurrenceId: m.recurrenceId })}
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

function MeetingsAside() {
  const today = useTodaysMeetings()
  if (!today.data) return null
  return <span className="text-sm text-ink-subtle">{today.data.length} today</span>
}

// No project-page block: meetings reach a project as edges, which the shell draws for every kind.
export const meetingModule: WorkspaceModule = {
  id: ID,
  label: 'Meetings',
  kind: {
    label: 'Meetings',
    to: `/${ID}`,
    Count: MeetingsTodayCount,
    Status: NextMeetingLine,
    chord: 'meetings',
    order: 30,
  },
  routes: [
    { index: true, element: <Meetings /> },
    // A meeting has no page of its own: this is the list with its pane open.
    { path: ':id', element: <Meetings /> },
  ],
  chords: [
    { id: 'meetings', key: 'm', label: 'Go to Meetings', resolve: () => `/${ID}`, order: 16 },
  ],
  calendar: { label: 'Meetings', useEntries: useMeetingEntries, Detail: CalendarDetail },
  widgets: [
    {
      id: 'today',
      label: 'Meetings',
      to: `/${ID}`,
      Component: TodayMeetings,
      Aside: MeetingsAside,
      order: 20,
      span: 6,
    },
  ],
  relations: [
    {
      type: 'meeting',
      kind: 'Meeting',
      to: (id) => `/${ID}/${id}`,
    },
  ],
}
