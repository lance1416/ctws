/**
 * THE ZONES A MEETING CAN BE AGREED IN.
 *
 * A short list and not the full tz database: this is one person's workbench, the list is a menu
 * someone reads, and 600 entries is not a menu. The column takes any IANA name, so a zone that is
 * not here costs nothing in the data when it is wanted -- this is an editorial choice about the
 * control, not a limit on the model.
 *
 * The browser's own zone is added at the top whatever it is, so the list is never missing the one
 * zone the person is certainly in.
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

function here(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  } catch {
    return 'UTC'
  }
}

export const ZONES: readonly string[] = [...new Set([here(), ...COMMON])]

/**
 * "Toronto · EDT" -- the city and the abbreviation that zone is using AT `at`.
 *
 * The abbreviation is what a person says ("that's 9 EST"), and it changes with the season, so it
 * is read from the platform at a named instant rather than written down. The city is the half of
 * the IANA name that means something to a reader.
 *
 * `at` IS REQUIRED. It used to default to `new Date()`, and two call sites took the default while
 * showing a meeting -- so a January meeting read in July said EDT, an hour off what the people in
 * the room agreed. A call site that cannot name an instant does not know which abbreviation it
 * means; the compiler should say so rather than the screen being quietly wrong half the year.
 */
export function zoneLabel(zone: string, at: Date): string {
  const city = zone.split('/').pop()?.replace(/_/g, ' ') ?? zone
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: zone,
      timeZoneName: 'short',
    }).formatToParts(at)
    const abbr = parts.find((p) => p.type === 'timeZoneName')?.value
    // A zone with no abbreviation of its own reports an offset like "GMT+8", which is already the
    // whole answer -- repeating the city beside it would say nothing more.
    return abbr && abbr !== city ? `${city} · ${abbr}` : city
  } catch {
    return city
  }
}
