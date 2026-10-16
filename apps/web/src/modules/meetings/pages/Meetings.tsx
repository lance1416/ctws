import { occurrenceKey, type MeetingOccurrence } from '@ctws/contracts'
import { useQuery } from '@tanstack/react-query'
import { Fragment, useState, type ReactNode } from 'react'
import { useForgetWhenGone } from '../../../shell/search'
import { GoneNotice } from '../../../shell/detail'
import { meetingsQuery, repeatLabel } from '../api'
import { EmptyState } from '../../../platform/ui/EmptyState'
import { OccurrencePane } from '../components/OccurrencePane'
import { useOpenOccurrence } from '../hooks/useOpenOccurrence'
import { NewMeetingDialog } from '../components/NewMeetingDialog'
import {
  BODY_GUTTER,
  DaySection,
  LIST_MEASURE,
  ProjectRail,
  ROW_LIST,
  RowLead,
} from '../../../shell/rows'
import { PanelEmpty } from '../../../platform/ui/Panel'
import { addDays } from '@ctws/core/day'
import { clockTime } from '@ctws/core/clock'
import { nearDay, weekdayDay, ymd } from '../../../platform/time/dates'
import { meetingLink } from '../logic/meetingPlace'
import { cityAndZone } from '../logic/timeZones'
import { useTimeZone } from '../../../shell/auth'
import { useNow } from '../../../platform/time/useNow'
import { BUTTON, LINK } from '../../../platform/ui/buttonStyles'
import { QueryStatus } from '../../../platform/ui/QueryStatus'
import { PageHead } from '../../../platform/ui/PageHead'
import { HANG } from '../../../platform/ui/hang'

/**
 * The next occurrence of each series, in time order. Next means not yet over: at 15:00 a daily
 * 09:00 standup's is tomorrow's; only a series with nothing later falls back to one that ended.
 */
function nextOfEach(rows: readonly MeetingOccurrence[], now: Date): MeetingOccurrence[] {
  const first = new Map<string, MeetingOccurrence>()
  for (const m of rows) {
    const held = first.get(m.meetingId)
    const over = (o: MeetingOccurrence) => new Date(o.endsAt).getTime() <= now.getTime()
    if (!held || (over(held) && !over(m))) first.set(m.meetingId, m)
  }
  return [...first.values()].sort((a, b) => a.startsAt.localeCompare(b.startsAt))
}

/** How far either way the two sections reach. */
const WINDOW_DAYS = 31

/** One row per series, showing its next occurrence; coming up first, the past behind a toggle. */
export function Meetings() {
  const accountZone = useTimeZone()
  const now = useNow()
  const today = ymd(now, accountZone)
  const [making, setMaking] = useState(false)
  const [showPast, setShowPast] = useState(false)

  const ahead = useQuery(meetingsQuery({ from: today, to: addDays(today, WINDOW_DAYS) }))
  const behind = useQuery({
    ...meetingsQuery({ from: addDays(today, -WINDOW_DAYS), to: addDays(today, -1) }),
    enabled: showPast,
  })

  const coming = nextOfEach(ahead.data ?? [], now)
  // Reversed, so the most recent of each series is the one shown.
  const past = nextOfEach([...(behind.data ?? [])].reverse(), now)
  // A named occurrence is any of the listed ones, not only the row's: today's stays open after it
  // ends and the row moves on to tomorrow's. Without `at` the link names only the series.
  const open = useOpenOccurrence({
    where: 'page',
    listed: ({ meetingId, at }) =>
      at === null
        ? [...coming, ...past].find((m) => m.meetingId === meetingId)
        : [...(ahead.data ?? []), ...(behind.data ?? [])].find(
            (m) => m.meetingId === meetingId && m.recurrenceId === at,
          ),
    ready: ahead.isSuccess,
    today,
  })
  // One occurrence gone is not the series gone, so only a series is forgotten.
  useForgetWhenGone('meeting', open.named?.meetingId ?? null, open.gone && open.named?.at === null)

  return (
    <>
      <div className={`${HANG} flex flex-wrap items-center justify-between gap-3`}>
        <PageHead>Meetings</PageHead>
        <button
          type="button"
          onClick={() => setMaking(true)}
          className={`whitespace-nowrap ${BUTTON.secondary}`}
        >
          New meeting
        </button>
      </div>

      <QueryStatus query={ahead} />
      {ahead.isSuccess && coming.length === 0 && (
        <EmptyState hang title="Nothing in the next month" />
      )}

      <div className={`mt-6 ${LIST_MEASURE}`}>
        {coming.length > 0 && (
          <Days
            label="Coming up"
            rows={coming}
            today={today}
            now={now}
            accountZone={accountZone}
            onOpen={open.show}
          />
        )}

        <div className="mt-8">
          <button
            type="button"
            onClick={() => setShowPast((v) => !v)}
            className={`ml-13 sm:ml-16 ${BUTTON.inline}`}
          >
            {showPast ? 'Hide earlier' : 'Earlier'}
          </button>
          {showPast &&
            (past.length === 0 ? (
              <PanelEmpty hang>Nothing in the past month</PanelEmpty>
            ) : (
              <div className="mt-4">
                <Days
                  label="Earlier"
                  rows={past}
                  today={today}
                  now={now}
                  accountZone={accountZone}
                  onOpen={open.show}
                />
              </div>
            ))}
        </div>
      </div>

      {making && (
        <NewMeetingDialog
          onClose={() => setMaking(false)}
          onMade={(made) => {
            setMaking(false)
            // Straight into the pane, where what the form cannot hold (a note, a place) is edited.
            open.show(made)
          }}
        />
      )}
      <OccurrencePane open={open} />
      {/* Gone, or cancelled. */}
      {open.gone && <GoneNotice kind="meeting" />}
    </>
  )
}

/** One stretch of the list, coming up or earlier, as a section per day. */
function Days({
  label,
  rows,
  today,
  now,
  accountZone,
  onOpen,
}: {
  label: string
  rows: readonly MeetingOccurrence[]
  today: string
  now: Date
  accountZone: string
  onOpen: (meeting: MeetingOccurrence) => void
}) {
  // Grouped by the account's day, not `recurrenceId`'s meeting-local date: 01:00 Friday in London
  // can be Thursday evening here, and every other screen groups by the account's zone.
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
  const dayName = (day: string) => nearDay(day, today) ?? weekdayDay(day, today)

  return (
    <section aria-label={label} className="flex flex-col gap-6">
      {[...days].map(([day, list]) => (
        <DaySection key={day} label={dayName(day)}>
          <ul className={ROW_LIST}>
            {list.map((m) => (
              <MeetingRow
                key={occurrenceKey(m)}
                meeting={m}
                today={today}
                now={now}
                accountZone={accountZone}
                onOpen={onOpen}
              />
            ))}
          </ul>
        </DaySection>
      ))}
    </section>
  )
}

/**
 * A meeting's row: the time on the account's clock, the project thread, the title and a line with
 * the rest. The title's button stretches over the row; Join sits above it as its own target.
 */
function MeetingRow({
  meeting: m,
  today,
  now,
  accountZone,
  onOpen,
}: {
  meeting: MeetingOccurrence
  today: string
  now: Date
  accountZone: string
  onOpen: (meeting: MeetingOccurrence) => void
}) {
  const over = new Date(m.endsAt).getTime() <= now.getTime()
  const join = meetingLink(m.location)
  const said: ReactNode[] = []
  // The project's name leads, so a clipped line still names it and colour is not the only signal.
  if (m.projectName) said.push(<span key="project">{m.projectName}</span>)
  // The agreed time when it is another zone: "09:30 London" is what the others in the room said.
  if (m.timeZone !== accountZone)
    said.push(
      <span key="zone" data-meeting-zone>
        {m.startsLocal.slice(11)} {cityAndZone(new Date(m.startsAt), m.timeZone)}
      </span>,
    )
  if (m.attendees.length > 0)
    said.push(<span key="who">{m.attendees.map((p) => p.name).join(', ')}</span>)
  if (m.rrule) said.push(<span key="repeat">{repeatLabel(m.rrule, m.startsLocal, today)}</span>)

  return (
    <li data-meeting-row={m.meetingId} className="group relative flex min-h-11 min-w-0">
      <RowLead
        lead={{
          text: clockTime(new Date(m.startsAt), accountZone),
          tone: over ? 'quiet' : 'time',
          flag: false,
        }}
        dateTime={m.startsAt}
      />
      <ProjectRail projectId={m.projectId} />
      <div
        className={`flex min-w-0 flex-1 items-start gap-2 py-2.5 pr-2 pl-[var(--gutter)] group-hover:bg-hover ${BODY_GUTTER}`}
      >
        <span className="flex min-w-0 flex-1 flex-col">
          <button
            type="button"
            onClick={() => onOpen(m)}
            className={`truncate text-left after:absolute after:inset-0 after:content-[''] ${
              over ? 'text-ink-subtle' : 'text-ink'
            }`}
          >
            {over && <span className="sr-only">Ended: </span>}
            {m.title}
          </button>
          {said.length > 0 && (
            <span className="truncate text-sm text-ink-muted">
              {said.map((part, i) => (
                <Fragment key={i}>
                  {i > 0 && <span aria-hidden="true"> · </span>}
                  {part}
                </Fragment>
              ))}
            </span>
          )}
        </span>
        {join && (
          <a
            href={join}
            target="_blank"
            rel="noreferrer"
            className={`relative z-10 shrink-0 rounded-md px-1.5 py-0.5 text-sm font-semibold ${LINK} hover:bg-hover`}
          >
            Join
          </a>
        )}
      </div>
    </li>
  )
}
