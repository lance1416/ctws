import { avatarInitials } from '@ctws/core'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { shortDay, ymd } from '../../../platform/time/dates'
import { Avatar } from '../../../platform/ui/Avatar'
import { Block, BlockFailed } from '../../../platform/ui/Block'
import { FollowUpIcon } from '../../../platform/ui/icons'
import { useTimeZone } from '../../../shell/auth'
import { OrganisationMark } from '../../organisations'
import { usePeople } from '../../people'
import { followUpsQuery } from '../api'
import { dueLine, followUpTone } from '../logic/followUp'
import { AwaitingActions } from './AwaitingActions'

/**
 * FOLLOW UP ON TODAY (FR-079, artboard 12): the messages whose follow-up day has come with no
 * reply, each with who it is with, when it was sent and when it fell due, and the two ways on: log
 * the reply, or follow up on Monday. With none, the block is its head saying so.
 */
export function FollowUpsToday({ today }: { today: string }) {
  const followUps = useQuery(followUpsQuery())
  const people = usePeople()
  const timeZone = useTimeZone()
  const rows = followUps.data ?? []
  const badge = { icon: FollowUpIcon, tint: 'bg-communication-bg text-communication' }
  if (followUps.isError)
    return (
      <Block badge={badge} title="Follow up">
        <BlockFailed what="follow-ups" onRetry={() => void followUps.refetch()} />
      </Block>
    )
  return (
    <Block
      badge={badge}
      title="Follow up"
      count={rows.length}
      empty={followUps.isSuccess && rows.length === 0 ? 'Nothing to chase today' : null}
    >
      <ul className="flex flex-col p-1.5">
        {rows.map((m) => {
          const person = m.parties.find((p) => p.type === 'person')
          const org = m.parties.find((p) => p.type === 'organisation')
          const known = person ? people.data?.find((p) => p.id === person.id) : undefined
          const who = person ?? org
          const sent = ymd(new Date(m.occurredAt), timeZone)
          return (
            <li
              key={m.id}
              data-follow-up={m.id}
              className="flex flex-col gap-1.5 rounded-control px-3 py-2 hover:bg-hover"
            >
              <Link to={`/communication/${m.id}`} className="flex min-w-0 items-center gap-2.5">
                {person ? (
                  <Avatar initials={known ? avatarInitials(known) : ([...person.name][0] ?? '')} />
                ) : (
                  <OrganisationMark name={org?.name ?? '?'} />
                )}
                <span className="flex min-w-0 flex-col">
                  <span className="truncate text-ui text-ink">{m.subject ?? 'No subject'}</span>
                  <span className="flex flex-wrap gap-x-2.5 text-meta text-muted">
                    {who && <span>{who.name}</span>}
                    <span>Sent {shortDay(sent, today)}</span>
                    {m.followUpOn && (
                      <span
                        className={
                          followUpTone(m.followUpOn, today) === 'late' ? 'text-stop-t' : ''
                        }
                      >
                        {dueLine(m.followUpOn, today)}
                      </span>
                    )}
                  </span>
                </span>
              </Link>
              <AwaitingActions message={m} later="monday" />
            </li>
          )
        })}
      </ul>
    </Block>
  )
}
