import { zoneAbbreviation } from '@ctws/core/clock'
import { browserZone } from '../../platform/time/dates'

/**
 * A short menu of zones rather than the whole tz database; the column takes any IANA name. The
 * browser's own zone is added at the top.
 */
const COMMON = [
  'Asia/Shanghai',
  'Asia/Hong_Kong',
  'Asia/Tokyo',
  'Asia/Singapore',
  'Asia/Kolkata',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'America/Toronto',
  'America/New_York',
  'America/Chicago',
  'America/Los_Angeles',
  'America/Vancouver',
  'Australia/Sydney',
  'UTC',
] as const

export const ZONES: readonly string[] = [...new Set([browserZone(), ...COMMON])]

/**
 * "Toronto · EDT": the city and the abbreviation the zone uses at `at`, which changes with the
 * season. `at` is required so a meeting is labelled for its own date, not today's.
 */
export function cityAndZone(at: Date, zone: string): string {
  const city = zone.split('/').pop()?.replace(/_/g, ' ') ?? zone
  try {
    const abbr = zoneAbbreviation(at, zone)
    // "UTC" is both city and abbreviation, so it is said once.
    return abbr && abbr !== city ? `${city} · ${abbr}` : city
  } catch {
    return city
  }
}
