import type { LinkCandidate } from '@ctws/contracts'
import { monthDay, ymd } from '../../platform/time/dates'
import { useTimeZone } from '../auth'

/** An organisation listed among things of every kind: its type ("Law firm"), or nothing. */
export function OrganisationFact({ thing }: { thing: LinkCandidate }) {
  return thing.type === 'organisation' && thing.organisationType ? (
    <span className="truncate">{thing.organisationType}</span>
  ) : null
}

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
