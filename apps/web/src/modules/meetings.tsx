import type { MeetingOccurrence } from '@ctws/contracts'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { listMeetings, meetingCalendar, meetingsKey } from '../api/meetings'
import { MeetingDetail } from '../components/MeetingDetail'
import { Meetings } from '../routes/Meetings'
import { PanelEmpty } from '../components/Panel'
import { ProjectRail } from '../components/RowParts'
import { useProjectRail } from '../projectColor'
import { todayIn } from '../dueAt'
import { useTimeZone } from '../useMe'
import { useNow } from '../useNow'
import type { WorkspaceModule } from './contract'

/**
 * THE MEETINGS MODULE -- the fourth.
 *
 * IT HAS A PAGE OF ITS OWN, and the calendar does not make one. In a calendar app an event is the
 * only entity, so a "+" on a day square is where one is made; here the calendar is a lens over
 * everything with a date -- a deadline, a day you mean to finish something, a meeting -- and a lens
 * does not own a kind of thing. The grid answers what is on this month.
 *
 * It contributes:
 *
 * - its own PAGE and a row in Things, where a meeting is arranged in one act;
 * - CALENDAR entries, with a time, and the pane one opens in;
 * - a WORKBENCH card for today, the one moment a flat list of meetings is the right shape --
 *   what is in the next eight hours is not a question about a month;
 * - a PROJECT block, because a meeting about the job hunt belongs to it.
 *
 * No search provider, on purpose: a meeting is found by its date, and the same weekly title
 * repeats fifty times over.
 */
const ID = 'meetings'

/**
 * The open occurrence, shared by every surface this module draws.
 *
 * Held as a pair of ids and looked up again on each render, so an edit made in the pane follows
 * the list's refetch instead of leaving the pane showing what it said before. A series has many
 * occurrences, so the series id alone does not name one.
 */
function useOpenMeeting(pool: readonly MeetingOccurrence[]) {
  const [open, setOpen] = useState<{ meetingId: string; recurrenceId: string } | null>(null)
  const accountZone = useTimeZone()
  const found = pool.find(
    (m) => m.meetingId === open?.meetingId && m.recurrenceId === open.recurrenceId,
  )
  const pane = found ? (
    <MeetingDetail meeting={found} accountZone={accountZone} onClose={() => setOpen(null)} />
  ) : null
  return { setOpen, pane }
}

/** This module's dated things, and the only ones with a clock on them. */
function useMeetingEntries(range: { from: string; to: string }) {
  const result = useQuery({
    queryKey: ['meeting-calendar', range.from, range.to],
    queryFn: () => meetingCalendar(range),
  })
  return { entries: result.data ?? [], isError: result.isError }
}

/**
 * What opens when one of this module's entries is clicked on the grid.
 *
 * The shell hands back the entry's id, which for a meeting is `<series>:<occurrence>` -- a series
 * shows several times on one grid, so the series alone does not say which one was clicked.
 */
function CalendarDetail({ id, onClose }: { id: string; onClose: () => void }) {
  const accountZone = useTimeZone()
  const [meetingId, recurrenceId] = splitEntryId(id)
  const found = useQuery({
    // Under the SAME prefix every other meetings query uses, so the pane's own edit -- which
    // invalidates `['meetings']` -- refetches this too. It did not, and an edit made here left the
    // pane showing what it said before.
    queryKey: ['meetings', 'one', meetingId, recurrenceId],
    queryFn: async () => {
      const got = await listMeetings({
        from: recurrenceId.slice(0, 10),
        to: recurrenceId.slice(0, 10),
      })
      return got.find((m) => m.meetingId === meetingId && m.recurrenceId === recurrenceId) ?? null
    },
  })
  if (!found.data) return null
  return <MeetingDetail meeting={found.data} accountZone={accountZone} onClose={onClose} />
}

/** `<series uuid>:<recurrence id>`. The uuid has a fixed length, so the split is unambiguous. */
function splitEntryId(id: string): [string, string] {
  return [id.slice(0, 36), id.slice(37)]
}

/** Today's meetings, shared by Things' count and status line. */
function useTodaysMeetings() {
  const day = todayIn(useTimeZone())
  return useQuery({
    queryKey: meetingsKey({ from: day, to: day }),
    queryFn: () => listMeetings({ from: day, to: day }),
  })
}

/** Things' count for meetings: how many are today, zero included. */
function MeetingsTodayCount() {
  const today = useTodaysMeetings()
  if (!today.data) return null
  return <span data-count>{today.data.length} today</span>
}

/** The next one still to come today, on the account's clock. */
function NextMeetingLine() {
  const accountZone = useTimeZone()
  const today = useTodaysMeetings()
  const next = today.data?.find((m) => new Date(m.startsAt).getTime() > Date.now())
  if (!next) return null
  const at = new Intl.DateTimeFormat('en-US', {
    timeZone: accountZone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(next.startsAt))
  return (
    <span data-status>
      Next: {next.title} at {at}
    </span>
  )
}

/** The hours the Workbench's line spans: the working day and its evening. */
const LINE_FROM = 8
const LINE_TO = 22
/**
 * Past this share of the line (in %) the now label sits to the LEFT of its mark. Not measured as a
 * threshold: it is chosen so a 32px "21:50" plus its 6px gap fits inside a 320px phone's line
 * (about 245px wide), and the 375px case is pinned by workbench-home.spec.
 */
const LABEL_FLIP = 80

/**
 * THE WORKBENCH'S MEETINGS: today as a line, 08:00 to 22:00, with each meeting a block on it and
 * NOW across it -- the one moment in the app a flat list of meetings is the wrong shape -- and
 * then the meetings as rows. A meeting outside those hours is in the rows all the same, and in the
 * line's name: the line is a picture of the working day, not a filter on it.
 */
function TodayMeetings() {
  const accountZone = useTimeZone()
  // Kept current while the Workbench sits open: the now mark, the greyed meetings and which day
  // is today all follow it (`useNow`).
  const now = useNow()
  const day = todayIn(accountZone, now)
  const meetings = useQuery({
    queryKey: meetingsKey({ from: day, to: day }),
    queryFn: () => listMeetings({ from: day, to: day }),
  })
  const rows = meetings.data ?? []
  const { setOpen, pane } = useOpenMeeting(rows)
  const rail = useProjectRail()
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
  if (meetings.isSuccess && rows.length === 0) return <PanelEmpty>No meetings today</PanelEmpty>

  const at = (d: Date) => clock.format(d)
  const minutes = (d: Date) => {
    const [h, m] = at(d).split(':').map(Number) as [number, number]
    return h * 60 + m
  }
  const pct = (min: number) => ((min - LINE_FROM * 60) / ((LINE_TO - LINE_FROM) * 60)) * 100
  const within = (min: number) => min >= LINE_FROM * 60 && min <= LINE_TO * 60
  /**
   * A meeting's span in minutes of today. One that ends tomorrow (its end reads earlier than its
   * start) runs to the end of the day, rather than ending a few minutes after midnight -- which
   * drew it as a sliver at its start.
   */
  const span = (m: (typeof rows)[number]) => {
    const from = minutes(new Date(m.startsAt))
    const to = minutes(new Date(m.endsAt))
    return { from, to: to > from ? to : 24 * 60 }
  }
  // ON THE LINE is any meeting that OVERLAPS its hours, not only one that starts inside them: a
  // run from 07:30 to 09:00 is on the line from 08:00.
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
      {/* ONE PICTURE, ONE NAME. To a screen reader the line is the sentence that says what it
          shows; the rows under it carry the same meetings as things to press. */}
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
          // Clipped to the line's hours at both ends.
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
            {/* The time beside the mark, on whichever side has room: past the last stretch of the
                evening it goes to the left, or it would push the page sideways on a phone. */}
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
              {/* Its project by name beside the thread's colour (WCAG 1.4.1), then who is in it. */}
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

/** The Meetings card's note: how many today. */
function MeetingsAside() {
  const today = useTodaysMeetings()
  if (!today.data) return null
  return <span className="text-sm text-ink-subtle">{today.data.length} today</span>
}

/**
 * NO BLOCK ON A PROJECT PAGE.
 *
 * This module's rows reach a project as edges, and the shell draws every kind of edge the same way.
 * One of these is made on its own page and filed there, or dropped into the capture box, never from
 * a project page.
 */

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
    // 一场会没有自己的页：这条路渲染的是列表加它的那一层（`Meetings` 从 URL 读开着的是哪一场）。
    { path: ':id', element: <Meetings /> },
  ],
  // `m`. One keyspace across modules, so this is checked against every other chord.
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
