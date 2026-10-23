import type { LinkCandidate } from '@ctws/contracts'
import { useNow } from '../../../platform/time/useNow'
import { useTimeZone } from '../../../shell/auth'
import { meetingWhen } from '../../../platform/time/meetingWhen'

/** A meeting listed among things of every kind: when it starts, in figures (DES-001 section 4). */
export function MeetingFact({ thing }: { thing: LinkCandidate }) {
  const timeZone = useTimeZone()
  const now = useNow()
  if (thing.type !== 'meeting') return null
  return <span className="font-mono text-meta">{meetingWhen(thing.startsAt, timeZone, now)}</span>
}
