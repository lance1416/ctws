import type { MeetingOccurrence } from '@ctws/contracts'

/**
 * The next occurrence of each series, in time order. Next means not yet over: at 15:00 a daily
 * 09:00 standup's is tomorrow's; only a series with nothing later falls back to one that ended.
 */
export function nextOfEach(rows: readonly MeetingOccurrence[], now: Date): MeetingOccurrence[] {
  const first = new Map<string, MeetingOccurrence>()
  for (const m of rows) {
    const held = first.get(m.meetingId)
    const over = (o: MeetingOccurrence) => new Date(o.endsAt).getTime() <= now.getTime()
    if (!held || (over(held) && !over(m))) first.set(m.meetingId, m)
  }
  return [...first.values()].sort((a, b) => a.startsAt.localeCompare(b.startsAt))
}
