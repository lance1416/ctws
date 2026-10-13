import { DAY_MS } from '@ctws/contracts'
import { instantOf, localOf } from './occurrences'

/** How far ahead a list with no window reaches; a series has no last occurrence. */
const DEFAULT_WINDOW_DAYS = 31

/** "EST" / "BST": the zone's short name at that moment. */
export function zoneLabel(at: Date, zone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: zone,
    timeZoneName: 'short',
  }).formatToParts(at)
  return parts.find((p) => p.type === 'timeZoneName')?.value ?? zone
}

/** `HH:MM` on a 24-hour clock in `zone`. */
export function clockTime(at: Date, zone: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: zone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(at)
}

/** Two account days as the instants that bound them; `to` runs to the end of its day. */
export function windowOf(from: string, to: string, zone: string): { from: Date; to: Date } {
  return {
    from: instantOf(`${from}T00:00`, zone),
    to: new Date(instantOf(`${to}T00:00`, zone).getTime() + DAY_MS),
  }
}

/** Today through a month ahead, in account days. */
export function defaultWindow(now: Date, zone: string): { from: string; to: string } {
  return {
    from: localOf(now, zone).slice(0, 10),
    to: localOf(new Date(now.getTime() + DEFAULT_WINDOW_DAYS * DAY_MS), zone).slice(0, 10),
  }
}
