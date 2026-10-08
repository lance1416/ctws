import type { MeetingOccurrence } from '@ctws/contracts'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import {
  createMeeting,
  DEFAULT_HOUR,
  DEFAULT_MINUTES,
  listMeetings,
  meetingCalendar,
  meetingsKey,
} from '../api/meetings'
import { MeetingDetail } from '../components/MeetingDetail'
import { PanelEmpty } from '../components/Panel'
import { todayIn } from '../dueAt'
import { useProjectRail } from '../projectColor'
import { useTimeZone } from '../useMe'
import type { WorkspaceModule } from './contract'

/**
 * THE MEETINGS MODULE -- the fourth, and the first with no page of its own.
 *
 * A meeting lives on the calendar. Giving it a rail row would be giving it a list to read instead
 * of a grid, which is not how anybody looks at what they have agreed to attend; every calendar app
 * since the first one has had you click a day. So it contributes:
 *
 * - CALENDAR entries, with a time, the way to MAKE one on a day, and the pane one opens in;
 * - a WORKBENCH card for today, the one moment a flat list of meetings is the right shape --
 *   「今天有什么会」 is a question about the next eight hours, not about a month;
 * - a PROJECT block, because a meeting about 找工作 belongs to it.
 *
 * No search provider, on purpose: a meeting is found by its date, and 「周会」 is the same title
 * fifty times over.
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

/** 「在这天安排一个会」 -- the shell draws the affordance, this decides what it does. */
function useArrange() {
  const qc = useQueryClient()
  const accountZone = useTimeZone()
  const create = useMutation({
    mutationFn: (day: string) =>
      createMeeting({
        title: 'New meeting',
        // A square has no time in it, so one has to be chosen: a plausible working hour the
        // person then drags onto the real one. Midnight would be precise and useless.
        startsLocal: `${day}T${String(DEFAULT_HOUR).padStart(2, '0')}:00`,
        // A meeting made by clicking a day is in the zone you are standing in. The pane is where
        // 「这个会是多伦多时间」 gets said, because that is a thing you know and the grid does not.
        timeZone: accountZone,
        durationMinutes: DEFAULT_MINUTES,
      }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['meetings'] })
      await qc.invalidateQueries({ queryKey: ['meeting-calendar'] })
    },
  })
  return { label: 'New meeting', create: (day: string) => create.mutate(day) }
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

/** THE WORKBENCH CARD: 「今天有什么会」, a question about the next eight hours. */
function TodayMeetings() {
  const accountZone = useTimeZone()
  const day = todayIn(accountZone)
  const meetings = useQuery({
    queryKey: meetingsKey({ from: day, to: day }),
    queryFn: () => listMeetings({ from: day, to: day }),
  })
  const rows = meetings.data ?? []
  const { setOpen, pane } = useOpenMeeting(rows)
  const clock = new Intl.DateTimeFormat('en-US', {
    timeZone: accountZone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })

  if (meetings.isError) {
    return (
      <p role="alert" className="px-2 py-1.5 text-sm text-danger">
        Couldn't load today's meetings
      </p>
    )
  }
  if (meetings.isSuccess && rows.length === 0) return <PanelEmpty>No meetings today</PanelEmpty>
  return (
    <>
      <ul className="min-w-0">
        {rows.map((m) => (
          <li
            key={`${m.meetingId}:${m.recurrenceId}`}
            className="flex min-h-9 min-w-0 items-center gap-2 px-2"
          >
            <span className="shrink-0 text-sm tabular-nums text-fg-muted">
              {clock.format(new Date(m.startsAt))}
            </span>
            <button
              type="button"
              onClick={() => setOpen({ meetingId: m.meetingId, recurrenceId: m.recurrenceId })}
              className="min-w-0 flex-1 truncate rounded text-left text-sm text-fg hover:underline"
            >
              {m.title}
            </button>
            {m.attendees.length > 0 && (
              <span className="shrink-0 truncate text-xs text-fg-subtle">
                {m.attendees.map((p) => p.name).join('、')}
              </span>
            )}
          </li>
        ))}
      </ul>
      {pane}
    </>
  )
}

/** The meetings about one line of work, from today on. */
function MeetingsProjectView({ projectId }: { projectId: string }) {
  const accountZone = useTimeZone()
  const meetings = useQuery({
    queryKey: meetingsKey({ projectId }),
    queryFn: () => listMeetings({ projectId }),
  })
  const rows = meetings.data ?? []
  const { setOpen, pane } = useOpenMeeting(rows)
  const rail = useProjectRail()
  const when = new Intl.DateTimeFormat('en-US', {
    timeZone: accountZone,
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })

  if (rows.length === 0) return <PanelEmpty>No meetings coming up</PanelEmpty>
  return (
    <>
      <ul className="flex flex-col">
        {rows.map((m) => (
          <li
            key={`${m.meetingId}:${m.recurrenceId}`}
            className="flex min-h-9 min-w-0 items-center gap-2 rounded-lg px-2 hover:bg-surface-hover"
          >
            <span
              aria-hidden="true"
              className={`h-3.5 w-[3px] shrink-0 rounded-full ${rail(projectId)}`}
            />
            <span className="shrink-0 text-sm tabular-nums text-fg-muted">
              {when.format(new Date(m.startsAt))}
            </span>
            <button
              type="button"
              onClick={() => setOpen({ meetingId: m.meetingId, recurrenceId: m.recurrenceId })}
              className="min-w-0 flex-1 truncate rounded text-left text-sm text-fg hover:underline"
            >
              {m.title}
            </button>
            {m.rrule && <span className="shrink-0 text-xs text-fg-subtle">Repeats</span>}
          </li>
        ))}
      </ul>
      {pane}
    </>
  )
}

export const meetingModule: WorkspaceModule = {
  id: ID,
  label: 'Meetings',
  // No rail row: a meeting is looked at on the calendar, not in a list.
  destinations: [],
  routes: [],
  calendar: {
    label: 'Meetings',
    useEntries: useMeetingEntries,
    useCreate: useArrange,
    Detail: CalendarDetail,
  },
  widgets: [{ id: 'today', label: "Today's meetings", to: '/calendar', Component: TodayMeetings }],
  ProjectView: MeetingsProjectView,
  // The calendar, because that is still the only place a meeting is visible. It is the clearest
  // thing wrong with the framing, and it changes when meetings get a destination of their own.
  relations: [{ type: 'meeting', to: () => '/calendar' }],
}
