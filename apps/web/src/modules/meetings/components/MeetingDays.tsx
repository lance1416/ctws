import { occurrenceKey, type MeetingOccurrence } from '@ctws/contracts'
import { clockTime } from '@ctws/core/clock'
import { Fragment, type ReactNode } from 'react'
import { nearDay, weekdayDay } from '../../../platform/time/dates'
import { LINK } from '../../../platform/ui/buttonStyles'
import { DaySection, ProjectRail, ROW_BODY, ROW_LIST, RowLead } from '../../../shell/rows'
import { repeatLabel } from '../api'
import { meetingLink } from '../logic/meetingPlace'
import { cityAndZone } from '../logic/timeZones'

/** One stretch of the list, coming up or earlier, as a section per day. */
export function MeetingDays({
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
      <div className={`${ROW_BODY} items-start gap-2 py-2.5 pr-2 group-hover:bg-hover`}>
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
