import type { MeetingOccurrence } from '@ctws/contracts'
import { useQuery } from '@tanstack/react-query'
import { Fragment, useState, type ReactNode } from 'react'
import { useForgetWhenGone } from '../../../shell/search/recent'
import { useNavigate, useParams } from 'react-router-dom'
import { listMeetings, meetingsKey, repeatLabel } from '../api/meetings'
import { EmptyState } from '../../../platform/ui/EmptyState'
import { MeetingDetail } from '../components/MeetingDetail'
import { NewMeetingDialog } from '../components/NewMeetingDialog'
import { DaySection } from '../../../shell/rows/DaySection'
import { PanelEmpty } from '../../../platform/ui/Panel'
import { RowLead } from '../../../shell/rows/RowLead'
import { BODY_GUTTER, ProjectRail, ROW_LIST } from '../../../shell/rows/RowParts'
import { addDays, todayIn } from '../../../platform/time/dates'
import { meetingLink } from '../meetingPlace'
import { zoneLabel } from '../timeZones'
import { LIST_MEASURE } from '../../../shell/rows/leads'
import { useTimeZone } from '../../../shell/auth/useMe'
import { useNow } from '../../../platform/time/useNow'
import { BUTTON, LINK } from '../../../platform/ui/buttonStyles'
import { useCrumbs } from '../../../shell/layout/Location'
import { QueryStatus } from '../../../platform/ui/QueryStatus'
import { PageHead } from '../../../platform/ui/PageHead'
import { HANG } from '../../../platform/ui/hang'

/**
 * MEETINGS -- the module's own page.
 *
 * A meeting is reached and MADE here, not on the calendar: the calendar is a LENS over everything
 * with a date, and a lens does not own a kind of thing. A meeting is something you arrange, so it
 * is arranged here, and the grid answers what is on this month.
 *
 * COMING UP FIRST, and the past behind a toggle, like the reading pile's finished section: a list
 * of meetings is read to find out what is about to happen to you.
 *
 * ONE ROW PER SERIES, not per occurrence. A daily standup has twenty-three occurrences in a
 * month, and a page that listed them all would BE the standup -- the list answers which meetings
 * you have, and the calendar answers what falls on which day. The row carries the next one's
 * time, because that is the part of a series anybody is asking about.
 */

/**
 * The next occurrence of each series, in time order. A series says so on its row.
 *
 * NEXT MEANS NOT YET OVER: at 15:00 a daily 09:00 standup's next one is tomorrow's, and showing
 * this morning's -- greyed, under Today -- hid the one time anybody is asking about. Only a series
 * with nothing later in the window falls back to the one that has ended.
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

/** How far either way the two sections reach. A personal calendar, not an archive. */
const WINDOW_DAYS = 31

export function Meetings() {
  useCrumbs([{ label: 'Things', to: '/things' }, { label: 'Meetings' }])
  const accountZone = useTimeZone()
  // Kept current while the page sits open (`useNow`): which day is today, and which meetings are
  // over, follow the clock.
  const now = useNow()
  const today = todayIn(accountZone, now)
  const [making, setMaking] = useState(false)
  const [showPast, setShowPast] = useState(false)
  /**
   * 开着的是哪一场，写在 URL 里 —— 这一层就是 `/meetings/<id>` 本身。
   *
   * 一场会没有自己的页：和人一样，URL 留着好让反向链接有地方可去，列表留在后面。一条指向会议的
   * 边说的是一个系列，所以它落在这个系列**下一次**那一场上 —— 跟着链接过来的人想看的就是它。
   */
  const { id: openId = null } = useParams()
  const navigate = useNavigate()
  const setOpen = (next: { meetingId: string } | null) =>
    navigate(next ? `/meetings/${next.meetingId}` : '/meetings')

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
  const coming = nextOfEach(ahead.data ?? [], now)
  // Backwards, the MOST RECENT of each series is the one worth showing.
  const past = nextOfEach([...(behind.data ?? [])].reverse(), now)
  const inWindow = [...coming, ...past].find((m) => m.meetingId === openId)
  // 窗口之外的那些：一条链接可以指向半年前开过的会，而列表只看前后 31 天。往前一年找，
  // 找不到再往回一年 —— 已经结束的系列也还有地址，而指向过去的一次性会议最常见。
  const far = useQuery({
    queryKey: ['meetings', 'series', openId],
    queryFn: async () => {
      if (!openId) return null
      const ahead = await listMeetings({ from: today, to: addDays(today, 370) })
      const hit = ahead.find((m) => m.meetingId === openId)
      if (hit) return hit
      const behind = await listMeetings({ from: addDays(today, -370), to: today })
      return [...behind].reverse().find((m) => m.meetingId === openId) ?? null
    },
    enabled: openId !== null && !inWindow,
  })
  const found = inWindow ?? far.data ?? null
  const gone = openId !== null && !found && far.isSuccess
  useForgetWhenGone('meeting', openId, gone)

  return (
    <>
      {/* The title on the margin's edge, where the rows' threads and the days' headings hang. */}
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
          {/* The switch's word on the edge, where the headings are: its own padding hangs left. */}
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
            // Straight into the pane, where the parts a form cannot hold -- a note, a place, an
            // exception to one week -- are edited. The server hands back the occurrence, so this
            // names the one that was just made rather than guessing which of a series it is.
            setOpen({ meetingId: made.meetingId })
          }}
        />
      )}
      {found && (
        <MeetingDetail meeting={found} accountZone={accountZone} onClose={() => setOpen(null)} />
      )}
      {/* 链接指向的会已经不在了（或者取消了）：说出来，别只留一个列表。 */}
      {gone && (
        <p role="alert" className={`mt-4 ${HANG} text-sm text-ink-muted`}>
          This meeting is not here any more.
        </p>
      )}
    </>
  )
}

/**
 * ONE STRETCH OF THE LIST -- coming up, or earlier -- as one section per day. The stretch has no
 * heading of its own: the days are the headings, and "Coming up" over "Today" said one thing twice.
 */
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
  onOpen: (at: { meetingId: string; recurrenceId: string }) => void
}) {
  const named = new Intl.DateTimeFormat('en-US', {
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
 * ONE MEETING, on the app's row: the time on YOUR clock in the margin -- when you have to be
 * somewhere -- quiet once it is over; its project's colour as the thread; then the title, and a
 * line with the rest: what was agreed when that is another clock, the project by name, who is in
 * it, how it repeats. Join stays on the row: at 09:29 the useful thing about a meeting link is a
 * control that opens it.
 *
 * THE WHOLE ROW OPENS IT (the title's button is stretched over the row); Join sits above that and
 * is its own target.
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
  onOpen: (at: { meetingId: string; recurrenceId: string }) => void
}) {
  const clock = new Intl.DateTimeFormat('en-US', {
    timeZone: accountZone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
  const over = new Date(m.endsAt).getTime() <= now.getTime()
  const join = meetingLink(m.location)
  const said: ReactNode[] = []
  // The thread is the project's colour; its name LEADS the line, so a clipped line still names
  // it (WCAG 1.4.1).
  if (m.projectName) said.push(<span key="project">{m.projectName}</span>)
  // What was actually AGREED, when that is not your clock: "09:30 London" is what the other
  // people in the room said, and it is not 04:30 anywhere.
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
            onClick={() => onOpen({ meetingId: m.meetingId, recurrenceId: m.recurrenceId })}
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
