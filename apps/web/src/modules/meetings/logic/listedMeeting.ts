import type { LinkCandidate } from '@ctws/contracts'
import { clockTime, zoneAbbreviation } from '@ctws/core/clock'
import { monthDay, ymd } from '../../../platform/time/dates'

/** "Oct 20, 21:00 · EDT": a series' own start on its own wall clock, where things are listed. */
export function describeMeeting(t: LinkCandidate): string | null {
  if (t.type !== 'meeting') return null
  const at = new Date(t.startsAt)
  const zone = t.timeZone
  return `${monthDay(ymd(at, zone))}, ${clockTime(at, zone)} · ${zoneAbbreviation(at, zone)}`
}
