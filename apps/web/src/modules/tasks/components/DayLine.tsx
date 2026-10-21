import { Fragment, type ReactNode } from 'react'
import { HANG_WIDTH } from '../../../platform/ui/hang'
import { ROW_LIST } from '../../../shell/rows'

/**
 * The day's line: what has a time today, in order, with now drawn across it, then the untimed
 * under "Any time". Each item draws its own row, so any kind of dated thing can join.
 */
export type DayItem = {
  key: string
  /** "HH:mm" in the account's zone, or null for something with no time today. */
  at: string | null
  /** When a thing that lasts ends; it is past only once this has gone by. */
  until?: string | null | undefined
  /** Whether the row says something in its margin already (a deadline's word). */
  hasLead: boolean
  row: (state: { past: boolean; anyTime: boolean }) => ReactNode
}

export function DayLine({ items, now }: { items: DayItem[]; now: string }) {
  const timed = items
    .filter((i) => i.at !== null)
    .sort((a, b) => (a.at! < b.at! ? -1 : a.at! > b.at! ? 1 : 0))
  const untimed = items.filter((i) => i.at === null)
  // What has started sits above the now line, and what has also ended is past. An end before its
  // start ran past midnight: it lasts the day.
  const cut = timed.findIndex((i) => i.at! > now)
  const started = cut === -1 ? timed : timed.slice(0, cut)
  const ahead = cut === -1 ? [] : timed.slice(cut)
  const over = (i: DayItem) => {
    const end = i.until && i.until >= i.at! ? i.until : i.until ? '24:00' : i.at!
    return end <= now
  }
  // The first untimed row with nothing of its own in the margin says "Any time" there.
  const labelled = untimed.find((i) => !i.hasLead)?.key
  return (
    <ul className={ROW_LIST}>
      {started.map((i) => (
        <Fragment key={i.key}>{i.row({ past: over(i), anyTime: false })}</Fragment>
      ))}
      {/* Only a line with times on it has a now. */}
      {timed.length > 0 && <NowLine at={now} />}
      {ahead.map((i) => (
        <Fragment key={i.key}>{i.row({ past: false, anyTime: false })}</Fragment>
      ))}
      {untimed.map((i) => (
        <Fragment key={i.key}>{i.row({ past: false, anyTime: i.key === labelled })}</Fragment>
      ))}
    </ul>
  )
}

/** Now, across the line: the time in the margin, in ink and weight, and a rule from it. */
function NowLine({ at }: { at: string }) {
  return (
    <li data-now-line className="flex h-6 items-center">
      <span
        className={`shrink-0 pr-2 text-right text-ui font-medium text-ink tabular-nums sm:pr-3.5 ${HANG_WIDTH}`}
      >
        <span className="sr-only">Now, </span>
        {at}
      </span>
      <span aria-hidden="true" className="flex flex-1 items-center">
        <span className="-ml-0.5 size-[7px] shrink-0 rounded-full bg-ink" />
        <span className="h-px flex-1 bg-ink" />
      </span>
    </li>
  )
}
