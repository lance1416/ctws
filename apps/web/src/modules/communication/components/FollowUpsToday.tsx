import { avatarInitials } from '@ctws/core'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { shortDay, ymd } from '../../../platform/time/dates'
import { Avatar } from '../../../platform/ui/Avatar'
import { Block, BlockFailed } from '../../../platform/ui/Block'
import { PhoneSection } from '../../../platform/ui/PhoneSection'
import { FollowUpIcon } from '../../../platform/ui/icons'
import type { CommunicationResponse } from '@ctws/contracts'
import { useAccountToday, useTimeZone } from '../../../shell/auth'
import type { InspectorList } from '../../../shell/contract'
import { AllInInspector, ListHead } from '../../../shell/inspector'
import { OrganisationMark } from '../../organisations'
import { usePeople } from '../../people'
import { followUpsQuery } from '../api'
import { dueLine } from '../logic/followUp'
import { AwaitingActions } from './AwaitingActions'

/**
 * FOLLOW UP ON TODAY (FR-079, artboard 12): the messages whose follow-up day has come with no
 * reply, each with who it is with, when it was sent and when it fell due, and the two ways on: log
 * the reply, or follow up on Monday. With none, the block is its head saying so.
 */
export function FollowUpsToday({ today }: { today: string }) {
  const followUps = useQuery(followUpsQuery())
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
        {rows.slice(0, SHOWN).map((m) => (
          <FollowUpRow key={m.id} message={m} today={today} />
        ))}
      </ul>
      {rows.length > SHOWN && (
        <AllInInspector list={FOLLOW_UPS} count={rows.length} className={ALL_ROW} />
      )}
    </Block>
  )
}

/** One message to chase: who, when sent and when it fell due, then its two ways on. */
function FollowUpRow({ message: m, today }: { message: CommunicationResponse; today: string }) {
  const people = usePeople()
  const timeZone = useTimeZone()
  const person = m.parties.find((p) => p.type === 'person')
  const org = m.parties.find((p) => p.type === 'organisation')
  const known = person ? people.data?.find((p) => p.id === person.id) : undefined
  const who = person ?? org
  const sent = ymd(new Date(m.occurredAt), timeZone)
  return (
    // Its face under the block's badge and its words under the block's name, as the other blocks
    // in Today's right column have them.
    <li
      data-follow-up={m.id}
      className="flex flex-col gap-1.5 rounded-control px-1.5 py-2 hover:bg-hover"
    >
      <Link
        to={`/communication/${m.id}`}
        className="flex min-w-0 items-center gap-2 max-lg:min-h-11"
      >
        {person ? (
          <Avatar initials={known ? avatarInitials(known) : ([...person.name][0] ?? '')} />
        ) : (
          <OrganisationMark name={org?.name ?? '?'} />
        )}
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-ui text-ink">{m.subject ?? 'No subject'}</span>
          <span className="flex flex-wrap gap-x-2.5 text-meta text-muted">
            {who && <span>{who.name}</span>}
            <span>Sent {shortDay(sent, today)}</span>
          </span>
        </span>
        {/* When it fell due, as its own tag on the right (C-03). */}
        {m.followUpOn && (
          <span className="inline-flex h-5.5 shrink-0 items-center rounded-control bg-warn-bg px-2 text-meta font-medium text-warn-t">
            {dueLine(m.followUpOn, today)}
          </span>
        )}
      </Link>
      <AwaitingActions message={m} later="monday" />
    </li>
  )
}

/** The whole of Follow up, in the inspector beside Today (FR-011 rule 3, U-08). */
function FollowUpsList() {
  const followUps = useQuery(followUpsQuery())
  const today = useAccountToday()
  const rows = followUps.data ?? []
  return (
    <>
      <ListHead
        badge={{ icon: FollowUpIcon, tint: 'bg-communication-bg text-communication' }}
        title="Follow up"
        count={rows.length}
      />
      <ul className="flex flex-col p-1.5">
        {rows.map((m) => (
          <FollowUpRow key={m.id} message={m} today={today} />
        ))}
      </ul>
    </>
  )
}

/** Today's Follow up names its full list by this. */
const FOLLOW_UPS = 'today-follow-ups'

export const followUpLists: InspectorList[] = [
  { name: FOLLOW_UPS, label: 'Today', icon: FollowUpIcon, Body: FollowUpsList },
]

/** A block's rows before its "All N" (FR-011 rule 3). */
const SHOWN = 5

/** A block's "All N", a row at its foot. */
const ALL_ROW =
  'flex h-9 max-lg:h-11 w-full items-center border-t border-line px-4 text-ui text-muted hover:bg-hover hover:text-ink'

/**
 * FOLLOW UP ON A PHONE'S TODAY (FR-083): the same rows as a section after Overdue, drawn only when
 * something is to be chased.
 */
export function FollowUpsPhone({ today }: { today: string }) {
  const followUps = useQuery(followUpsQuery())
  const rows = followUps.data ?? []
  if (rows.length === 0) return null
  return (
    <PhoneSection
      icon={<FollowUpIcon size={14} className="text-communication" />}
      title="Follow up"
      count={rows.length}
      foot={
        rows.length > SHOWN && (
          <AllInInspector list={FOLLOW_UPS} count={rows.length} className={ALL_ROW} />
        )
      }
    >
      {rows.slice(0, SHOWN).map((m) => (
        <FollowUpRow key={m.id} message={m} today={today} />
      ))}
    </PhoneSection>
  )
}
