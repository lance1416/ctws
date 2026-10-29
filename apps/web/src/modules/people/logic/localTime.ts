import { clockTime } from '@ctws/core/clock'

/** Minutes a zone is ahead of UTC at `at`, by the zone's own rules (so DST counts). */
function offsetMinutes(timeZone: string, at: Date): number {
  const name = new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'longOffset' })
    .formatToParts(at)
    .find((p) => p.type === 'timeZoneName')?.value
  const m = /GMT([+-])(\d{2}):?(\d{2})?/.exec(name ?? '')
  if (!m) return 0
  return (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3] ?? 0))
}

/**
 * Their local time beside yours (FR-061): the same, or their clock and how far ahead or behind
 * ("17:24, 7 hours ahead"), by both zones' rules at `at`.
 */
export function theirTime(at: Date, theirs: string, mine: string): string {
  const diff = offsetMinutes(theirs, at) - offsetMinutes(mine, at)
  if (diff === 0) return 'Same as yours'
  const hours = Math.abs(diff) / 60
  const amount = Number.isInteger(hours) ? `${hours}` : hours.toFixed(1)
  return `${clockTime(at, theirs)}, ${amount} hour${hours === 1 ? '' : 's'} ${diff > 0 ? 'ahead' : 'behind'}`
}

/**
 * Their clock and how far it is from yours, apart (a phone's profile card, FR-087): null when it
 * is your time too, where the card leaves the line out.
 */
export function timeApart(
  at: Date,
  theirs: string,
  mine: string,
): { clock: string; apart: string } | null {
  const diff = offsetMinutes(theirs, at) - offsetMinutes(mine, at)
  if (diff === 0) return null
  const hours = Math.abs(diff) / 60
  const amount = Number.isInteger(hours) ? `${hours}` : hours.toFixed(1)
  return {
    clock: clockTime(at, theirs),
    apart: `${amount} hour${hours === 1 ? '' : 's'} ${diff > 0 ? 'ahead of' : 'behind'} you`,
  }
}
