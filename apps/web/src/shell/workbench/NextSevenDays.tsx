import { addDays } from '@ctws/core/day'
import { Link } from 'react-router-dom'
import { weekdayOf } from '../../platform/time/dates'
import { Block, BlockFailed } from '../../platform/ui/Block'
import { FlagIcon, GoOnIcon, KIND_ICON, PLACE_ICON } from '../../platform/ui/icons'
import { KIND_ON_TINT, KIND_TEXT, KIND_TINT } from '../../platform/ui/kinds'
import { useAccountToday } from '../auth'
import type { ShownEntry } from '../contract'
import { useRegistry } from '../registry'

/** What the week shows of the calendar (FR-076): deadlines, follow-ups and meetings. */
const SHOWN_KINDS = ['occurrence', 'due', 'follow-up'] as const
/** Chips a day holds before the rest are counted. */
const PER_DAY = 3

/** A day's things in the order they are read: meetings by time, then deadlines, then follow-ups. */
const rank = (e: ShownEntry) => SHOWN_KINDS.indexOf(e.kind as (typeof SHOWN_KINDS)[number])
const byDay = (a: ShownEntry, b: ShownEntry) =>
  rank(a) - rank(b) || (a.time ?? '').localeCompare(b.time ?? '') || a.title.localeCompare(b.title)

/**
 * NEXT SEVEN DAYS (FR-076, artboards 10 and 22): today and the six after, a column each, with what
 * falls on it: a meeting by its time, a deadline by its flag and name (amber by tomorrow), a
 * follow-up. Today's column is shaded. Its head goes to the calendar.
 */
export function NextSevenDays() {
  const today = useAccountToday()
  const range = { from: today, to: addDays(today, 6) }
  const providers = useRegistry().calendar
  // The registry is fixed for the app's life: each provider's hook is called in the same order.
  const results = providers.map((p) => ({ ...p.useEntries(range), opens: p.opens }))
  const failed = results.find((r) => r.isError)
  // One that opens over the calendar's grid opens there; the rest go where their module says.
  const entries = results.flatMap(({ entries, opens }) =>
    entries
      .filter((e) => (SHOWN_KINDS as readonly string[]).includes(e.kind))
      .map((e) => (opens ? { ...e, to: `/calendar?${new URLSearchParams(opens.params(e))}` } : e)),
  )
  const days = Array.from({ length: 7 }, (_, i) => addDays(today, i))
  return (
    <Block
      badge={{ icon: PLACE_ICON.calendar, tint: 'bg-hover text-muted' }}
      title="Next seven days"
      actions={
        <Link
          to="/calendar"
          className="mr-1.5 inline-flex items-center gap-1 text-meta text-muted hover:text-ink"
        >
          Calendar
          <GoOnIcon size={12} aria-hidden="true" />
        </Link>
      }
    >
      {failed ? (
        <BlockFailed what="week" onRetry={() => results.forEach((r) => r.isError && r.retry())} />
      ) : (
        <ol className="grid min-h-0 flex-1 grid-cols-7 gap-1 p-2 max-sm:grid-cols-4">
          {days.map((day) => {
            const on = entries.filter((e) => e.day === day).sort(byDay)
            const isToday = day === today
            return (
              <li
                key={day}
                data-week-day={day}
                className={`flex min-w-0 flex-col gap-1.5 overflow-hidden rounded-card px-2 py-2.5 ${isToday ? 'bg-select' : ''}`}
              >
                <span
                  className={`font-mono text-meta ${isToday ? 'font-medium text-ink' : 'text-muted'}`}
                >
                  {weekdayOf(day, true)}
                </span>
                <span
                  className={`text-prose tabular-nums text-ink ${isToday ? 'font-medium' : ''}`}
                >
                  {Number(day.slice(8))}
                </span>
                {on.slice(0, PER_DAY).map((e) => (
                  <Chip key={e.key} entry={e} soon={day <= addDays(today, 1)} />
                ))}
                {on.length > PER_DAY && (
                  <Link
                    to={`/calendar?day=${day}`}
                    className="px-1.5 text-meta text-muted hover:text-ink"
                  >{`+${on.length - PER_DAY} more`}</Link>
                )}
              </li>
            )
          })}
        </ol>
      )}
    </Block>
  )
}

/** One thing on a day: a meeting's time, a deadline's name, or "Follow up". */
function Chip({ entry: e, soon }: { entry: ShownEntry; soon: boolean }) {
  const look =
    e.kind === 'occurrence'
      ? {
          tone: `${KIND_TINT.meeting} ${KIND_ON_TINT.meeting}`,
          icon: <KIND_ICON.meeting size={12} aria-hidden="true" className="shrink-0" />,
          text: e.time ?? e.title,
        }
      : e.kind === 'follow-up'
        ? {
            tone: `${KIND_TINT.communication} ${KIND_TEXT.communication}`,
            icon: <KIND_ICON.communication size={12} aria-hidden="true" className="shrink-0" />,
            text: 'Follow up',
          }
        : {
            tone: soon ? 'bg-warn-bg text-warn-t' : 'bg-hover text-muted',
            icon: <FlagIcon size={12} aria-hidden="true" className="shrink-0" />,
            text: e.title,
          }
  return (
    <Link
      to={e.to}
      title={e.title}
      data-week-entry={e.kind}
      className={`flex h-5.5 min-w-0 items-center gap-1.25 rounded-key px-1.5 text-meta font-medium whitespace-nowrap hover:brightness-95 ${look.tone}`}
    >
      {look.icon}
      <span className="truncate">{look.text}</span>
    </Link>
  )
}
