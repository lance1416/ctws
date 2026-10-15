import type { MeetingOccurrence } from '@ctws/contracts'
import { useQuery } from '@tanstack/react-query'
import { Fragment, useState, type ReactNode } from 'react'
import { useForgetWhenGone } from '../../../shell/search/recent'
import { GoneNotice } from '../../../shell/detail/GoneNotice'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { meetingsQuery, occurrenceQuery, repeatLabel, seriesQuery } from '../api'
import { EmptyState } from '../../../platform/ui/EmptyState'
import { MeetingDetail } from '../components/MeetingDetail'
import { NewMeetingDialog } from '../components/NewMeetingDialog'
import { DaySection } from '../../../shell/rows/DaySection'
import { PanelEmpty } from '../../../platform/ui/Panel'
import { RowLead } from '../../../shell/rows/RowLead'
import { BODY_GUTTER, ProjectRail, ROW_LIST } from '../../../shell/rows/RowParts'
import { addDays, clockTime, todayIn } from '../../../platform/time/dates'
import { meetingLink } from '../meetingPlace'
import { zoneLabel } from '../timeZones'
import { LIST_MEASURE } from '../../../shell/rows/leads'
import { useTimeZone } from '../../../shell/auth/useMe'
import { useNow } from '../../../platform/time/useNow'
import { BUTTON, LINK } from '../../../platform/ui/buttonStyles'
import { useCrumbs } from '../../../shell/layout/Breadcrumbs'
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

/** An occurrence by its two ids: a series has many, so its id alone does not name one. */
type Occurrence = { meetingId: string; recurrenceId: string }

/** One row per series, showing its next occurrence; coming up first, the past behind a toggle. */
export function Meetings() {
  useCrumbs([{ label: 'Things', to: '/things' }, { label: 'Meetings' }])
  const accountZone = useTimeZone()
  const now = useNow()
  const today = todayIn(accountZone, now)
  const [making, setMaking] = useState(false)
  const [showPast, setShowPast] = useState(false)
  // The open meeting is in the address as `/meetings/<id>?at=<occurrence>`. Without `at` the link
  // names only the series, so it opens the series' next occurrence.
  const { id: openId = null } = useParams()
  const at = useSearchParams()[0].get('at')
  const navigate = useNavigate()
  const setOpen = (next: Occurrence | null) =>
    navigate(
      next
        ? `/meetings/${next.meetingId}?${new URLSearchParams({ at: next.recurrenceId })}`
        : '/meetings',
    )

  const ahead = useQuery(meetingsQuery({ from: today, to: addDays(today, WINDOW_DAYS) }))
  const behind = useQuery({
    ...meetingsQuery({ from: addDays(today, -WINDOW_DAYS), to: addDays(today, -1) }),
    enabled: showPast,
  })

  const coming = nextOfEach(ahead.data ?? [], now)
  // Reversed, so the most recent of each series is the one shown.
  const past = nextOfEach([...(behind.data ?? [])].reverse(), now)
  const listed = [...coming, ...past].find(
    (m) => m.meetingId === openId && (at === null || m.recurrenceId === at),
  )
  // Asked for only once the list is in and does not have it.
  const missing = openId !== null && ahead.isSuccess && !listed
  const one = useQuery({
    ...occurrenceQuery(openId ?? '', at ?? ''),
    enabled: missing && at !== null,
  })
  const far = useQuery({ ...seriesQuery(openId ?? '', today), enabled: missing && at === null })
  const fetched = at === null ? far : one
  const found = listed ?? fetched.data ?? null
  const gone = openId !== null && !found && fetched.isSuccess
  // One occurrence gone is not the series gone, so only a series is forgotten.
  useForgetWhenGone('meeting', openId, gone && at === null)

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
            onOpen={setOpen}
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
                  onOpen={setOpen}
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
            setOpen(made)
          }}
        />
      )}
      {found && (
        <MeetingDetail meeting={found} accountZone={accountZone} onClose={() => setOpen(null)} />
      )}
      {/* Gone, or cancelled. */}
      {gone && <GoneNotice kind="meeting" />}
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
  onOpen: (at: Occurrence) => void
}) {
  const named = new Intl.DateTimeFormat('en-US', {
    timeZone: accountZone,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })
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
  const dayName = (day: string) =>
    day === today
      ? 'Today'
      : day === addDays(today, 1)
        ? 'Tomorrow'
        : day === addDays(today, -1)
          ? 'Yesterday'
          : named.format(new Date(`${day}T12:00:00Z`))

  return (
    <section aria-label={label} className="flex flex-col gap-6">
      {[...days].map(([day, list]) => (
        <DaySection key={day} label={dayName(day)}>
          <ul className={ROW_LIST}>
            {list.map((m) => (
              <MeetingRow
                key={`${m.meetingId}:${m.recurrenceId}`}
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
  onOpen: (at: Occurrence) => void
}) {
  const clock = clockTime(accountZone)
  const over = new Date(m.endsAt).getTime() <= now.getTime()
  const join = meetingLink(m.location)
  const said: ReactNode[] = []
  // The project's name leads, so a clipped line still names it and colour is not the only signal.
  if (m.projectName) said.push(<span key="project">{m.projectName}</span>)
  // The agreed time when it is another zone: "09:30 London" is what the others in the room said.
  if (m.timeZone !== accountZone)
    said.push(
      <span key="zone" data-meeting-zone>
        {m.startsLocal.slice(11)} {zoneLabel(m.timeZone, new Date(m.startsAt))}
      </span>,
    )
  if (m.attendees.length > 0)
    said.push(<span key="who">{m.attendees.map((p) => p.name).join(', ')}</span>)
  if (m.rrule) said.push(<span key="repeat">{repeatLabel(m.rrule, m.startsLocal, today)}</span>)

  return (
    <li data-meeting-row={m.meetingId} className="group relative flex min-h-11 min-w-0">
      <RowLead
        lead={{
          text: clock.format(new Date(m.startsAt)),
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
