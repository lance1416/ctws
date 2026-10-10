import type { MeetingOccurrence } from '@ctws/contracts'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { listMeetings, meetingCalendar, meetingsKey } from '../api/meetings'
import { MeetingDetail, MeetingFields } from '../components/MeetingDetail'
import { ObjectPage } from '../components/ObjectPage'
import { Meetings } from '../routes/Meetings'
import { PanelEmpty } from '../components/Panel'
import { addDays, todayIn } from '../dueAt'
import { useProjectRail } from '../projectColor'
import { useTimeZone } from '../useMe'
import type { WorkspaceModule } from './contract'

/**
 * THE MEETINGS MODULE -- the fourth.
 *
 * IT HAS A PAGE OF ITS OWN, and the calendar does not make one. In a calendar app an event is the
 * only entity, so a "+" on a day square is where one is made; here the calendar is a lens over
 * everything with a date -- a deadline, a day you mean to finish something, a meeting -- and a
 * lens does not own a kind of thing (framing §2). The grid answers what is on this month.
 *
 * It contributes:
 *
 * - its own PAGE and rail row, where a meeting is arranged in one act;
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

/** THE WORKBENCH CARD: today's meetings, a question about the next eight hours. */
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
                {m.attendees.map((p) => p.name).join(', ')}
              </span>
            )}
          </li>
        ))}
      </ul>
      {pane}
    </>
  )
}

/**
 * NO BLOCK ON A PROJECT PAGE.
 *
 * This module's rows reach a project as edges, and the shell draws every kind of edge the same
 * way (framing §2). One of these is made on its own page and filed there, or dropped into the
 * capture box, never from a project page.
 */

/**
 * ONE MEETING'S OWN FIELDS, at the head of its page.
 *
 * A SERIES has many occurrences and the page is about the series, so it opens on the NEXT one --
 * which is the occurrence anybody following a link to a meeting means. Editing from here still
 * asks which occurrences a change touches, exactly as the pane does.
 */
function MeetingHead({ id }: { id: string }) {
  const accountZone = useTimeZone()
  const today = todayIn(accountZone)
  const found = useQuery({
    queryKey: ['meetings', 'series', id],
    queryFn: async () => {
      // Forward first, then back: a series that has finished still has a page, and a one-off in
      // the past is the commonest thing to follow a link to.
      const ahead = await listMeetings({ from: today, to: addDays(today, 370) })
      const hit = ahead.find((m) => m.meetingId === id)
      if (hit) return hit
      const behind = await listMeetings({ from: addDays(today, -370), to: today })
      return [...behind].reverse().find((m) => m.meetingId === id) ?? null
    },
  })
  if (!found.data) {
    return found.isSuccess ? (
      <p className="text-sm text-fg-muted">This meeting is not here any more.</p>
    ) : null
  }
  return <MeetingFields meeting={found.data} accountZone={accountZone} />
}

export const meetingModule: WorkspaceModule = {
  id: ID,
  label: 'Meetings',
  destinations: [{ id: 'list', to: `/${ID}`, label: 'Meetings', zone: 'things', order: 20 }],
  routes: [
    { index: true, element: <Meetings /> },
    { path: ':id', element: <ObjectPage type="meeting" /> },
  ],
  // `m`. One keyspace across modules, so this is checked against every other chord.
  chords: [
    { id: 'meetings', key: 'm', label: 'Go to Meetings', resolve: () => `/${ID}`, order: 16 },
  ],
  calendar: { label: 'Meetings', useEntries: useMeetingEntries, Detail: CalendarDetail },
  widgets: [{ id: 'today', label: "Today's meetings", to: '/calendar', Component: TodayMeetings }],
  relations: [{ type: 'meeting', kind: 'Meeting', to: (id) => `/${ID}/${id}`, Head: MeetingHead }],
}
