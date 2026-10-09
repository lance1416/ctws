import type { MeetingOccurrence } from '@ctws/contracts'
import { useQuery } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import { listMeetings, meetingsKey, repeatLabel } from '../api/meetings'
import { EmptyState } from '../components/EmptyState'
import { MeetingDetail } from '../components/MeetingDetail'
import { NewMeetingDialog } from '../components/NewMeetingDialog'
import { PanelEmpty } from '../components/Panel'
import { addDays, todayIn } from '../dueAt'
import { meetingLink } from '../meetingPlace'
import { useProjectRail } from '../projectColor'
import { zoneLabel } from '../timeZones'
import { LIST_MEASURE } from '../rowLead'
import { useTimeZone } from '../useMe'

/**
 * 会议 -- the module's own page, which it did not have.
 *
 * Until now the only way to reach a meeting was the calendar, and the only way to MAKE one was
 * the "+" on a day square. That was the framing mistake named in the redesign: the calendar is a
 * LENS over everything with a date, and a lens does not own a kind of thing. A meeting is
 * something you arrange, so it is arranged here, and the grid goes back to answering 「这个月有
 * 什么」.
 *
 * COMING UP FIRST, and the past behind a toggle, like the reading pile's finished section: a list
 * of meetings is read to find out what is about to happen to you.
 *
 * ONE ROW PER SERIES, not per occurrence. A daily standup has twenty-three occurrences in a
 * month, and a page that listed them all would BE the standup -- the list answers 「我有哪些会」
 * and the calendar answers 「哪天有什么」. The row carries the next one's time, because that is
 * the part of a series anybody is asking about.
 */

/** The next occurrence of each series, in time order. A series says so on its row. */
function nextOfEach(rows: readonly MeetingOccurrence[]): MeetingOccurrence[] {
  const first = new Map<string, MeetingOccurrence>()
  for (const m of rows) if (!first.has(m.meetingId)) first.set(m.meetingId, m)
  return [...first.values()]
}

/** How far either way the two sections reach. A personal calendar, not an archive. */
const WINDOW_DAYS = 31

export function Meetings() {
  const accountZone = useTimeZone()
  const today = todayIn(accountZone)
  const heading = useRef<HTMLHeadingElement>(null)
  const [making, setMaking] = useState(false)
  const [showPast, setShowPast] = useState(false)
  const [open, setOpen] = useState<{ meetingId: string; recurrenceId: string } | null>(null)

  const ahead = useQuery({
    queryKey: meetingsKey({ from: today, to: addDays(today, WINDOW_DAYS) }),
    queryFn: () => listMeetings({ from: today, to: addDays(today, WINDOW_DAYS) }),
  })
  const behind = useQuery({
    queryKey: meetingsKey({ from: addDays(today, -WINDOW_DAYS), to: addDays(today, -1) }),
    queryFn: () => listMeetings({ from: addDays(today, -WINDOW_DAYS), to: addDays(today, -1) }),
    enabled: showPast,
  })

  // The server returns occurrences in time order, so the first of each series is its next one.
  const coming = nextOfEach(ahead.data ?? [])
  // Backwards, the MOST RECENT of each series is the one worth showing.
  const past = nextOfEach([...(behind.data ?? [])].reverse())
  const found = [...coming, ...past].find(
    (m) => m.meetingId === open?.meetingId && m.recurrenceId === open.recurrenceId,
  )

  return (
    <>
      <div className="flex items-center justify-between gap-3">
        <h1 ref={heading} tabIndex={-1} className="text-xl font-semibold focus:outline-none">
          Meetings
        </h1>
        <button
          type="button"
          onClick={() => setMaking(true)}
          className="h-9 rounded-lg border border-border-strong px-3 text-sm font-semibold text-fg hover:bg-surface-hover"
        >
          New meeting
        </button>
      </div>

      {ahead.isPending && <p className="mt-6 text-fg-muted">Loading…</p>}
      {ahead.isError && (
        <p role="alert" className="mt-6 text-danger">
          {ahead.error instanceof Error
            ? ahead.error.message
            : "Couldn't load. Check that the server is running."}
        </p>
      )}
      {ahead.isSuccess && coming.length === 0 && <EmptyState title="Nothing in the next month" />}

      <div className={`mt-4 ${LIST_MEASURE}`}>
        {coming.length > 0 && (
          <Section
            title="Coming up"
            rows={coming}
            today={today}
            accountZone={accountZone}
            onOpen={setOpen}
          />
        )}

        <div className="mt-8">
          <button
            type="button"
            onClick={() => setShowPast((v) => !v)}
            className="rounded-md px-2 py-1 text-sm text-fg-muted hover:bg-surface-hover hover:text-fg"
          >
            {showPast ? 'Hide earlier' : 'Earlier'}
          </button>
          {showPast &&
            (past.length === 0 ? (
              <PanelEmpty>Nothing in the past month</PanelEmpty>
            ) : (
              <Section
                title="Earlier"
                rows={past}
                today={today}
                accountZone={accountZone}
                onOpen={setOpen}
              />
            ))}
        </div>
      </div>

      {making && (
        <NewMeetingDialog
          onClose={() => setMaking(false)}
          onMade={(made) => {
            setMaking(false)
            // Straight into the pane, where the parts a form cannot hold -- a note, a place, an
            // exception to one week -- are edited. The server hands back the occurrence, so this
            // names the one that was just made rather than guessing which of a series it is.
            setOpen({ meetingId: made.meetingId, recurrenceId: made.recurrenceId })
          }}
        />
      )}
      {found && (
        <MeetingDetail meeting={found} accountZone={accountZone} onClose={() => setOpen(null)} />
      )}
    </>
  )
}

/** One stretch of the list, with its day headings. */
function Section({
  title,
  rows,
  today,
  accountZone,
  onOpen,
}: {
  title: string
  rows: readonly MeetingOccurrence[]
  today: string
  accountZone: string
  onOpen: (at: { meetingId: string; recurrenceId: string }) => void
}) {
  const rail = useProjectRail()
  const clock = new Intl.DateTimeFormat('en-US', {
    timeZone: accountZone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
  const heading = new Intl.DateTimeFormat('en-US', {
    timeZone: accountZone,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })

  // THE DAY IS YOURS, NOT THE MEETING'S. `recurrenceId` carries the meeting's own local date, and
  // 01:00 Friday in London is Thursday evening where you are standing -- grouping by it would put
  // a meeting under a date no other screen in this app agrees with. Derived from the instant in
  // the account's zone, the same rule the calendar squares and the Today page follow.
  const dayOf = new Intl.DateTimeFormat('en-CA', {
    timeZone: accountZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  const days = new Map<string, MeetingOccurrence[]>()
  for (const m of rows) {
    const day = dayOf.format(new Date(m.startsAt))
    const list = days.get(day)
    if (list) list.push(m)
    else days.set(day, [m])
  }

  return (
    <section aria-label={title} className="mt-6">
      <h2 className="text-sm font-semibold text-fg-muted">{title}</h2>
      {[...days].map(([day, list]) => (
        <div key={day} className="mt-4">
          <h3 className="px-2 text-xs font-semibold text-fg-subtle">
            {day === today ? 'Today' : heading.format(new Date(`${day}T12:00:00Z`))}
          </h3>
          <ul className="mt-1 flex flex-col">
            {list.map((m) => (
              <li
                key={`${m.meetingId}:${m.recurrenceId}`}
                data-meeting-row={m.meetingId}
                className="flex min-h-9 min-w-0 items-center gap-2 rounded-lg px-2 hover:bg-surface-hover"
              >
                <span
                  aria-hidden="true"
                  className={`h-3.5 w-[3px] shrink-0 rounded-full ${rail(m.projectId ?? '')}`}
                />
                {/* YOUR clock first, because that is when you have to be somewhere. */}
                <span className="shrink-0 text-sm tabular-nums text-fg-muted">
                  {clock.format(new Date(m.startsAt))}
                </span>
                <button
                  type="button"
                  onClick={() => onOpen({ meetingId: m.meetingId, recurrenceId: m.recurrenceId })}
                  className="min-w-0 max-w-full truncate rounded text-left text-sm text-fg hover:underline"
                >
                  {m.title}
                </button>
                {/* And what was actually AGREED, when that is not your clock: 「09:30 London」 is
                    the thing the other people in the room said, and it is not 04:30 anywhere. */}
                {m.timeZone !== accountZone && (
                  <span className="min-w-0 shrink truncate text-xs text-fg-subtle">
                    {m.startsLocal.slice(11)} {zoneLabel(m.timeZone)}
                  </span>
                )}
                <span className="flex-1" />
                {m.attendees.length > 0 && (
                  <span className="min-w-0 shrink truncate text-xs text-fg-subtle">
                    {m.attendees.map((p) => p.name).join(', ')}
                  </span>
                )}
                {m.rrule && (
                  <span className="shrink-0 text-xs text-fg-subtle">
                    {repeatLabel(m.rrule, m.startsLocal)}
                  </span>
                )}
                {/* JOIN, from the list. At 09:29 the useful thing about a meeting link is a
                    control that opens it, not a string to go and find. */}
                {meetingLink(m.location) && (
                  <a
                    href={meetingLink(m.location)!}
                    target="_blank"
                    rel="noreferrer"
                    className="shrink-0 rounded-md px-1.5 py-0.5 text-xs font-semibold text-accent hover:bg-surface-hover"
                  >
                    Join
                  </a>
                )}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  )
}
