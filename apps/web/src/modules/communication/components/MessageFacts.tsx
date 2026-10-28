import type { LinkCandidate } from '@ctws/contracts'
import { monthDay, ymd } from '../../../platform/time/dates'
import { ReceivedIcon, SentIcon } from '../../../platform/ui/icons'
import { useTimeZone } from '../../../shell/auth'

/** A message listed among things of every kind: its day, in figures (DES-001 section 4). */
export function MessageFact({ thing }: { thing: LinkCandidate }) {
  const timeZone = useTimeZone()
  if (thing.type !== 'communication') return null
  return (
    <span className="font-mono text-meta">
      {monthDay(ymd(new Date(thing.occurredAt), timeZone))}
    </span>
  )
}

/** Which way it went, on the message's tint, where things of every kind are listed. */
export function MessageMark({ thing }: { thing: LinkCandidate }) {
  if (thing.type !== 'communication') return null
  const Way = thing.direction === 'sent' ? SentIcon : ReceivedIcon
  return (
    <span className="inline-grid size-6 place-items-center rounded-control bg-communication-bg text-communication">
      <Way size={14} aria-hidden="true" />
    </span>
  )
}
