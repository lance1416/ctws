import { avatarInitials } from '@ctws/core'
import { useQuery } from '@tanstack/react-query'
import { NavLink } from 'react-router-dom'
import { shortDay, ymd } from '../../../platform/time/dates'
import { Avatar } from '../../../platform/ui/Avatar'
import { ReceivedIcon, SentIcon } from '../../../platform/ui/icons'
import { useAccountToday, useTimeZone } from '../../../shell/auth'
import { OrganisationMark } from '../../organisations'
import { usePeople } from '../../people'
import { awaitingQuery, recentQuery } from '../api'
import { followUpLine, followUpTone } from '../logic/followUp'

const ROW = ({ isActive }: { isActive: boolean }) =>
  `mx-1.5 flex min-h-11 items-start gap-2.5 rounded-control px-2 py-1.5 hover:bg-hover ${
    isActive ? 'bg-select' : ''
  }`

/** The Recent half lists this many. */
const RECENT = 10

/**
 * The Communication sidebar's list (FR-071, artboard 15): what is awaiting a reply, the soonest
 * follow-up first, each with who it is with and how its follow-up stands; then the newest
 * exchanges, each by which way it went.
 */
export function CommunicationSidebar() {
  const awaiting = useQuery(awaitingQuery())
  const recent = useQuery(recentQuery())
  const people = usePeople()
  const today = useAccountToday()
  const timeZone = useTimeZone()
  const waiting = new Set((awaiting.data ?? []).map((m) => m.id as string))
  return (
    <nav aria-label="Communication" className="flex min-h-0 flex-1 flex-col overflow-y-auto pb-2">
      <section aria-label="Awaiting reply">
        <h3 className="flex items-center px-3.5 pt-1 pb-1 text-meta text-muted">
          <span className="flex-1">Awaiting reply</span>
          <span className="tabular-nums">{awaiting.data?.length ?? ''}</span>
        </h3>
        <ul className="flex flex-col gap-px">
          {(awaiting.data ?? []).map((m) => {
            const person = m.parties.find((p) => p.type === 'person')
            const org = m.parties.find((p) => p.type === 'organisation')
            const known = person ? people.data?.find((p) => p.id === person.id) : undefined
            const late = m.followUpOn !== null && followUpTone(m.followUpOn, today) === 'late'
            return (
              <li key={m.id} data-awaiting-row={m.id}>
                <NavLink to={`/communication/${m.id}`} className={ROW}>
                  {person ? (
                    <Avatar
                      initials={known ? avatarInitials(known) : ([...person.name][0] ?? '')}
                    />
                  ) : (
                    <OrganisationMark name={org?.name ?? '?'} />
                  )}
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate text-ui text-ink">{m.subject ?? 'No subject'}</span>
                    {m.followUpOn && (
                      <span className={`text-meta ${late ? 'text-stop-t' : 'text-muted'}`}>
                        {followUpLine(m.followUpOn, today)}
                      </span>
                    )}
                  </span>
                </NavLink>
              </li>
            )
          })}
        </ul>
      </section>
      <section aria-label="Recent" className="mt-2">
        <h3 className="px-3.5 pt-1 pb-1 text-meta text-muted">Recent</h3>
        <ul className="flex flex-col gap-px">
          {(recent.data ?? [])
            .filter((m) => !waiting.has(m.id))
            .slice(0, RECENT)
            .map((m) => {
              const Way = m.direction === 'sent' ? SentIcon : ReceivedIcon
              const day = ymd(new Date(m.occurredAt), timeZone)
              return (
                <li key={m.id} data-recent-row={m.id}>
                  <NavLink to={`/communication/${m.id}`} className={ROW}>
                    <span className="inline-grid size-6 shrink-0 place-items-center rounded-control bg-communication-bg text-communication">
                      <Way size={14} aria-hidden="true" />
                      <span className="sr-only">
                        {m.direction === 'sent' ? 'Sent' : 'Received'}
                      </span>
                    </span>
                    <span className="flex min-w-0 flex-col">
                      <span className="line-clamp-2 text-ui text-ink">
                        {m.subject ?? 'No subject'}
                      </span>
                      <span className="text-meta text-muted">
                        {day === today ? 'Today' : shortDay(day, today)}
                      </span>
                    </span>
                  </NavLink>
                </li>
              )
            })}
        </ul>
      </section>
    </nav>
  )
}
