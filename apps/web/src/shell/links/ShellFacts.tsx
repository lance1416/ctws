import type { LinkCandidate } from '@ctws/contracts'
import { monthDay, ymd } from '../../platform/time/dates'
import { useTimeZone } from '../auth'

/** A message listed among things of every kind: its day, in figures (DES-001 section 4). */
export function CommunicationFact({ thing }: { thing: LinkCandidate }) {
  const timeZone = useTimeZone()
  if (thing.type !== 'communication') return null
  return (
    <span className="font-mono text-meta">
      {monthDay(ymd(new Date(thing.occurredAt), timeZone))}
    </span>
  )
}
