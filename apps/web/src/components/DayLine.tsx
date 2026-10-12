import { Fragment, type ReactNode } from 'react'
import { MARGIN } from './RowLead'
import { ROW_LIST } from './RowParts'

/**
 * THE DAY'S LINE: what has a time today, in time order, with NOW drawn across it -- and then
 * whatever has no time, under "Any time".
 *
 * It does not care what an item is: a task due at four, a meeting at half past ten and a birthday
 * are all items, so a new kind of dated thing joins the line without this changing. Each item
 * draws its own row; this decides the order, where the now line falls, and which row carries the
 * "Any time" word.
 */
export type DayItem = {
  key: string
  /** "HH:mm" in the account's zone, or null for something with no time today. */
  at: string | null
  /** Whether the row says something in its margin already (a carried day, a deadline's word). */
  hasLead: boolean
  row: (state: { past: boolean; anyTime: boolean }) => ReactNode
}

export function DayLine({ items, now }: { items: DayItem[]; now: string }) {
  const timed = items
    .filter((i) => i.at !== null)
    .sort((a, b) => (a.at! < b.at! ? -1 : a.at! > b.at! ? 1 : 0))
  const untimed = items.filter((i) => i.at === null)
  // Everything up to now is past; the line goes before the first thing still to come.
  const cut = timed.findIndex((i) => i.at! > now)
  const past = cut === -1 ? timed : timed.slice(0, cut)
  const ahead = cut === -1 ? [] : timed.slice(cut)
  // The first untimed row with nothing of its own in the margin says "Any time" there.
  const labelled = untimed.find((i) => !i.hasLead)?.key
  return (
    <ul className={ROW_LIST}>
      {past.map((i) => (
        <Fragment key={i.key}>{i.row({ past: true, anyTime: false })}</Fragment>
      ))}
      {/* Only a line with times on it has a now: with nothing timed there is nothing to place it
          between, and a line across an untimed list would mean nothing. */}
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
        className={`shrink-0 pr-2 text-right text-sm font-semibold text-ink tabular-nums sm:pr-3.5 ${MARGIN}`}
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
