/** Something on the day's timeline: a meeting with its span, or a deadline at a moment. */
export type TimedItem = {
  key: string
  kind: 'meeting' | 'due'
  title: string
  /** Minutes since midnight on the account's clock. */
  start: number
  /** A meeting's end; a deadline has none. */
  end?: number | undefined
  joinUrl?: string | null | undefined
  to?: string | undefined
}

/** One mark on the line: an item, or several close together drawn as one node with a count. */
type TimelineNode = {
  key: string
  items: TimedItem[]
  /** Share of the line, 0 to 1. */
  at: number
  until: number
  /** Where the next node starts, so this one's words stop short of it. */
  room: number
}

export type DayTimeline = {
  fromHour: number
  toHour: number
  /** The even hours labelled under the line. */
  ticks: { hour: number; at: number }[]
  /** Where now is on the line; null outside it. Everything before it is past. */
  now: number | null
  /** The open stretch from now to the next timed thing, and how long it is. */
  free: { at: number; until: number; minutes: number } | null
  nodes: TimelineNode[]
}

/** Items closer than this start as one node: their words could not both be read (FR-015). */
const CLOSE_MINUTES = 40

/**
 * THE DAY'S TIMELINE (FR-079): 08 to 20 by default, reaching out to the hour of anything earlier
 * or later; now, the stretch free until the next timed thing, and the things themselves, those
 * too close to read apart drawn as one node.
 */
export function dayTimeline(items: readonly TimedItem[], nowMinutes: number): DayTimeline {
  const sorted = [...items].sort((a, b) => a.start - b.start)
  const earliest = Math.min(8 * 60, ...sorted.map((i) => i.start))
  const latest = Math.max(20 * 60, ...sorted.map((i) => i.end ?? i.start))
  const fromHour = Math.floor(earliest / 60)
  const toHour = Math.min(24, Math.ceil(latest / 60))
  const span = (toHour - fromHour) * 60
  const share = (minutes: number) => Math.min(1, Math.max(0, (minutes - fromHour * 60) / span))

  const ticks = []
  for (let h = fromHour + (fromHour % 2); h <= toHour; h += 2)
    ticks.push({ hour: h, at: share(h * 60) })
  if (ticks[0]?.hour !== fromHour) ticks.unshift({ hour: fromHour, at: 0 })

  const inside = nowMinutes >= fromHour * 60 && nowMinutes <= toHour * 60
  const busy = sorted.some((i) => i.start <= nowMinutes && (i.end ?? i.start) > nowMinutes)
  const next = sorted.find((i) => i.start > nowMinutes)
  const free =
    inside && !busy && next
      ? { at: share(nowMinutes), until: share(next.start), minutes: next.start - nowMinutes }
      : null

  const groups: TimedItem[][] = []
  for (const item of sorted) {
    const last = groups.at(-1)
    if (last && item.start - last[0]!.start < CLOSE_MINUTES) last.push(item)
    else groups.push([item])
  }
  const nodes = groups.map((group, i) => {
    const first = group[0]!
    const end = Math.max(...group.map((g) => g.end ?? g.start))
    const following = groups[i + 1]?.[0]
    return {
      key: group.map((g) => g.key).join('+'),
      items: group,
      at: share(first.start),
      until: share(end),
      room: following ? share(following.start) : 1,
    }
  })
  return { fromHour, toHour, ticks, now: inside ? share(nowMinutes) : null, free, nodes }
}

/** "4h 50m free", "50m", "2h". */
export function lengthOf(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return [h > 0 ? `${h}h` : '', m > 0 || h === 0 ? `${m}m` : ''].filter(Boolean).join(' ')
}

/** "14:00" as minutes since midnight. */
export const minutesOf = (hhmm: string): number => {
  const [h, m] = hhmm.split(':').map(Number) as [number, number]
  return h * 60 + m
}
