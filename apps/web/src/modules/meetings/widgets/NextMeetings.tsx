import { addDays } from '@ctws/core/day'
import { clockTime } from '@ctws/core/clock'
import type { MeetingOccurrence } from '@ctws/contracts'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { weekdayOf, ymd } from '../../../platform/time/dates'
import { useNow } from '../../../platform/time/useNow'
import { Block, BlockFailed, SkeletonRows } from '../../../platform/ui/Block'
import { BUTTON } from '../../../platform/ui/buttonStyles'
import { JoinIcon, KIND_ICON, PlacesIcon } from '../../../platform/ui/icons'
import { useAccountToday, useTimeZone } from '../../../shell/auth'
import { useRowsThatFit } from '../../../shell/workbench'
import { meetingsQuery } from '../api'
import { occurrenceTo } from '../components/EarlierInSeries'
import { joinLink } from '../logic/meetingPlace'

/** How far ahead it looks: a fortnight holds the next few of a busy or a quiet week. */
const AHEAD_DAYS = 13
/** The meetings after the next, one line each. */
const ROW_PX = 30
const MOST = 4

/**
 * NEXT MEETINGS ON THE WORKBENCH (FR-076, artboards 10 and 22): the next one on a meeting-tinted
 * card, with its day and time, where, and Join and Notes; the ones after it a line each, as many as
 * the place holds. One under way is still next until it ends.
 */
export function NextMeetings() {
  const today = useAccountToday()
  const zone = useTimeZone()
  const now = useNow()
  const meetings = useQuery(meetingsQuery({ from: today, to: addDays(today, AHEAD_DAYS) }))
  const [later, fits] = useRowsThatFit(ROW_PX, MOST)
  const coming = (meetings.data ?? []).filter((m) => new Date(m.endsAt) > now)
  const [next, ...after] = coming
  const when = (m: MeetingOccurrence) => {
    const day = ymd(new Date(m.startsAt), zone)
    return {
      day: day === today ? 'Today' : weekdayOf(day, true),
      time: clockTime(new Date(m.startsAt), zone),
    }
  }
  return (
    <Block
      kind="meeting"
      title="Next meetings"
      empty={meetings.isSuccess && !next ? 'No meetings in the next 7 days.' : null}
      keepsSize
    >
      {meetings.isError ? (
        <BlockFailed what="meetings" onRetry={() => void meetings.refetch()} />
      ) : !meetings.isSuccess || !next ? (
        <SkeletonRows rows={2} />
      ) : (
        <div className="flex min-h-0 flex-1 flex-col gap-2.5 px-3 py-2.5">
          <NextOne meeting={next} when={when(next)} />
          <ul ref={later} className="flex min-h-0 flex-1 flex-col overflow-hidden">
            {after.slice(0, fits).map((m) => {
              const w = when(m)
              return (
                <li key={`${m.meetingId}@${m.recurrenceId}`}>
                  <Link
                    to={occurrenceTo(m)}
                    data-next-meeting={m.meetingId}
                    className="grid h-7.5 grid-cols-[36px_44px_minmax(0,1fr)] items-center gap-x-2.5 rounded-control px-2.5 hover:bg-hover"
                  >
                    <span className="font-mono text-meta text-muted">{w.day}</span>
                    <span className="font-mono text-meta text-muted">{w.time}</span>
                    <span className="truncate text-ui text-ink">{m.title}</span>
                  </Link>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </Block>
  )
}

/** The next meeting, on its card: when, what, where, and the way in and to its notes. */
function NextOne({
  meeting: m,
  when,
}: {
  meeting: MeetingOccurrence
  when: { day: string; time: string }
}) {
  const join = joinLink(m.joinUrl, m.location)
  return (
    <div
      data-next-meeting-card={m.meetingId}
      className="grid shrink-0 grid-cols-[52px_minmax(0,1fr)] gap-x-2.5 gap-y-1.5 rounded-card bg-meeting-bg p-2.5"
    >
      <span className="flex flex-col font-mono text-meta font-medium text-meeting-t">
        <span>{when.day}</span>
        <span>{when.time}</span>
      </span>
      <span className="flex min-w-0 flex-col">
        <Link
          to={occurrenceTo(m)}
          className="truncate text-ui font-medium text-ink hover:underline"
        >
          {m.title}
        </Link>
        {m.location && !join?.startsWith(m.location) && (
          <span className="inline-flex min-w-0 items-center gap-1 text-meta text-muted">
            <PlacesIcon size={12} aria-hidden="true" className="shrink-0" />
            <span className="truncate">{m.location}</span>
          </span>
        )}
      </span>
      <span />
      <span className="flex gap-1.5">
        {join && (
          <a
            href={join}
            target="_blank"
            rel="noreferrer"
            className={`${BUTTON.secondary} h-7 px-2.5 text-meta`}
          >
            <JoinIcon size={14} aria-hidden="true" />
            Join
          </a>
        )}
        <Link
          to={`${occurrenceTo(m)}&write=1`}
          className={`${BUTTON.secondary} h-7 px-2.5 text-meta`}
        >
          <KIND_ICON.note size={14} aria-hidden="true" />
          Notes
        </Link>
      </span>
    </div>
  )
}
