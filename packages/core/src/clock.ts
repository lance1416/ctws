const formats = new Map<string, Intl.DateTimeFormat>()

/** One formatter per zone: building one costs far more than using it, and lists ask per row. */
function hhmm(zone: string): Intl.DateTimeFormat {
  let f = formats.get(zone)
  if (!f) {
    // `h23`, not `hour12: false`: some engines write midnight as 24 under the latter.
    f = new Intl.DateTimeFormat('en-GB', {
      timeZone: zone,
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
    formats.set(zone, f)
  }
  return f
}

const dayFormats = new Map<string, Intl.DateTimeFormat>()

/** The calendar day `at` falls on in `zone`, `YYYY-MM-DD`. */
export function dayIn(at: Date, zone: string): string {
  let f = dayFormats.get(zone)
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: zone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
    dayFormats.set(zone, f)
  }
  const part = (type: string) => f.formatToParts(at).find((p) => p.type === type)!.value
  return `${part('year')}-${part('month')}-${part('day')}`
}

/** `HH:MM` on a 24-hour clock in `zone`. */
export const clockTime = (at: Date, zone: string): string => hhmm(zone).format(at)

/** The zone's short name at that moment: "EST", "BST", "GMT+8". It changes with the season. */
export function zoneAbbreviation(at: Date, zone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: zone,
    timeZoneName: 'short',
  }).formatToParts(at)
  return parts.find((p) => p.type === 'timeZoneName')?.value ?? zone
}
