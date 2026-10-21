import { addDays, daysInMonth, LUNAR_MONTHS } from '@ctws/core'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useRef } from 'react'
import { ICON_BUTTON } from '../../platform/ui/buttonStyles'
import { BackIcon, ForwardIcon } from '../../platform/ui/icons'
import { MONTHS } from '../../platform/time/dates'
import { calendarDaysQuery } from '../calendar/api'

/** The grid's one week, Monday first, as the calendar page draws it. */
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
/** Monday is 0. */
const weekdayOf = (day: string) => (new Date(`${day}T00:00:00Z`).getUTCDay() + 6) % 7

const pad = (n: number) => String(n).padStart(2, '0')
export const monthOf = (day: string) => day.slice(0, 7)
export const addMonths = (month: string, n: number): string => {
  const [y, m] = month.split('-').map(Number) as [number, number]
  const d = new Date(Date.UTC(y, m - 1 + n, 1))
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`
}
const monthTitle = (month: string) => {
  const [y, m] = month.split('-').map(Number) as [number, number]
  return `${MONTHS[m - 1]} ${y}`
}

/** The cell every grid shares: the big value, the small one under it, the states. */
function Cell({
  big,
  small,
  selected,
  today,
  out = false,
  accent,
  label,
  onPick,
}: {
  big: string
  small?: string | undefined
  selected: boolean
  today: boolean
  out?: boolean
  accent: string
  label: string
  onPick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onPick}
      aria-label={label}
      aria-pressed={selected}
      className={`flex h-13 flex-col items-center justify-center rounded-control ${
        selected
          ? `${accent} text-on-project`
          : `text-ink hover:bg-hover ${today ? 'shadow-[inset_0_0_0_1.5px_var(--color-line-strong)]' : ''}`
      } ${out ? 'opacity-40' : ''}`}
    >
      <span className="text-prose leading-5">{big}</span>
      <span className={`text-meta tabular-nums ${selected ? 'text-on-project/85' : 'text-subtle'}`}>
        {small ?? ' '}
      </span>
    </button>
  )
}

function Head({
  title,
  onPrev,
  onNext,
  prevLabel,
  nextLabel,
}: {
  title: string
  onPrev: () => void
  onNext: () => void
  prevLabel: string
  nextLabel: string
}) {
  return (
    <div className="flex h-8 items-center">
      <button type="button" onClick={onPrev} aria-label={prevLabel} className={ICON_BUTTON}>
        <BackIcon size={16} aria-hidden="true" />
      </button>
      <span className="flex-1 text-center text-ui font-medium text-ink">{title}</span>
      <button type="button" onClick={onNext} aria-label={nextLabel} className={ICON_BUTTON}>
        <ForwardIcon size={16} aria-hidden="true" />
      </button>
    </div>
  )
}

function WeekdayRow() {
  return (
    <div className="grid grid-cols-7 gap-0.5">
      {WEEKDAYS.map((d) => (
        <span key={d} className="py-1 text-center text-meta font-medium text-subtle">
          {d}
        </span>
      ))}
    </div>
  )
}

/**
 * A SOLAR MONTH (FR-034): the solar day big, its lunar name small, as on the calendar page. The
 * month shown is the caller's state, so the field can open on the chosen day.
 */
export function DayGrid({
  month,
  setMonth,
  value,
  today,
  onPick,
  accent = 'bg-task',
}: {
  month: string
  setMonth: (m: string) => void
  value: string | null
  today: string
  onPick: (day: string) => void
  /** The fill of the chosen day: the kind's colour where the field belongs to a kind. */
  accent?: string
}) {
  const first = `${month}-01`
  const lead = weekdayOf(first)
  const start = addDays(first, -lead)
  // Only the weeks that hold one of the month's days: four, five or six rows (artboard 11).
  const [y, m] = month.split('-').map(Number) as [number, number]
  const weeks = Math.ceil((lead + daysInMonth(y, m)) / 7)
  const cells = Array.from({ length: weeks * 7 }, (_, i) => addDays(start, i))
  const lunar = useQuery({
    ...calendarDaysQuery({ from: cells[0]!, to: cells.at(-1)! }),
    placeholderData: keepPreviousData,
  })
  return (
    <div className="flex flex-col gap-1">
      <Head
        title={monthTitle(month)}
        onPrev={() => setMonth(addMonths(month, -1))}
        onNext={() => setMonth(addMonths(month, 1))}
        prevLabel="Previous month"
        nextLabel="Next month"
      />
      <WeekdayRow />
      <div className="grid grid-cols-7 gap-0.5">
        {cells.map((day) => (
          <Cell
            key={day}
            big={String(Number(day.slice(8)))}
            // The month's name is in the head; a first day's label keeps only its day.
            small={lunar.data?.[day]?.replace(/^.*月/, '')}
            selected={day === value}
            today={day === today}
            out={monthOf(day) !== month}
            accent={accent}
            label={day}
            onPick={() => onPick(day)}
          />
        ))}
      </div>
    </div>
  )
}

/** The lunar days of `month`'s label window, from the server's names (the client has no tables). */
function useLunarWindow(anchor: string) {
  const from = addDays(anchor, -40)
  const to = addDays(anchor, 40)
  return useQuery({ ...calendarDaysQuery({ from, to }), placeholderData: keepPreviousData })
}

/** The lunar month `anchor` falls in: its solar days, in order, and its name. */
export function lunarMonthAround(
  days: Record<string, string>,
  anchor: string,
): { name: string; days: { solar: string; name: string }[] } | null {
  const sorted = Object.keys(days).sort()
  const starts = sorted.filter((d) => days[d]!.endsWith('初一'))
  const start = [...starts].reverse().find((d) => d <= anchor)
  if (!start) return null
  const next = starts.find((d) => d > start)
  const end = next ? addDays(next, -1) : null
  if (!end || !sorted.includes(end)) return null
  const name = days[start]!.replace(/初一$/, '')
  const list: { solar: string; name: string }[] = []
  for (let d = start; d <= end; d = addDays(d, 1)) {
    const label = days[d]
    if (!label) return null
    list.push({ solar: d, name: label.replace(name, '') })
  }
  return { name, days: list }
}

/**
 * A LUNAR MONTH (FR-034): the lunar day big, the solar day small; paged by lunar month, a leap
 * month in its own place. Anchored on a solar day, since that is what the page knows.
 */
export function LunarGrid({
  anchor,
  setAnchor,
  value,
  today,
  onPick,
  accent = 'bg-person',
}: {
  anchor: string
  setAnchor: (day: string) => void
  /** The chosen day as a solar day, when it is one of the visible month's. */
  value: string | null
  today: string
  onPick: (pick: { solar: string; month: number; day: number; leapMonth: boolean }) => void
  accent?: string
}) {
  const window = useLunarWindow(anchor)
  const found = window.data ? lunarMonthAround(window.data, anchor) : null
  // While the next month's names load, the last month stays drawn with its arrows, so paging on
  // never meets an empty box.
  const last = useRef<ReturnType<typeof lunarMonthAround>>(null)
  if (found) last.current = found
  const month = found ?? last.current
  if (!month)
    return (
      <div className="flex h-56 items-center justify-center text-ui text-subtle">
        {window.isError ? 'Couldn’t load the lunar month.' : ''}
      </div>
    )
  const leapMonth = month.name.startsWith('闰')
  const number =
    LUNAR_MONTHS.indexOf(month.name.replace(/^闰/, '') as (typeof LUNAR_MONTHS)[number]) + 1
  const lead = weekdayOf(month.days[0]!.solar)
  return (
    <div className="flex flex-col gap-1">
      <Head
        title={month.name}
        onPrev={() => setAnchor(addDays(month.days[0]!.solar, -1))}
        onNext={() => setAnchor(addDays(month.days.at(-1)!.solar, 1))}
        prevLabel="Previous lunar month"
        nextLabel="Next lunar month"
      />
      <WeekdayRow />
      <div className="grid grid-cols-7 gap-0.5">
        {Array.from({ length: lead }, (_, i) => (
          <span key={`lead-${i}`} />
        ))}
        {month.days.map((d, i) => {
          const solarDay = Number(d.solar.slice(8))
          const small =
            i === 0 || solarDay === 1
              ? `${MONTHS[Number(d.solar.slice(5, 7)) - 1]} ${solarDay}`
              : String(solarDay)
          return (
            <Cell
              key={d.solar}
              big={d.name}
              small={small}
              selected={d.solar === value}
              today={d.solar === today}
              accent={accent}
              label={`${month.name}${d.name}`}
              onPick={() => onPick({ solar: d.solar, month: number, day: i + 1, leapMonth })}
            />
          )
        })}
      </div>
    </div>
  )
}

/** TWELVE MONTHS of a year (FR-034): for a role's start and end, known to the month. */
export function MonthGrid({
  year,
  setYear,
  value,
  today,
  onPick,
  accent = 'bg-task',
}: {
  year: number
  setYear: (y: number) => void
  value: string | null
  today: string
  onPick: (month: string) => void
  accent?: string
}) {
  return (
    <div className="flex flex-col gap-1">
      <Head
        title={String(year)}
        onPrev={() => setYear(year - 1)}
        onNext={() => setYear(year + 1)}
        prevLabel="Previous year"
        nextLabel="Next year"
      />
      <div className="grid grid-cols-4 gap-0.5">
        {MONTHS.map((name, i) => {
          const month = `${year}-${pad(i + 1)}`
          return (
            <Cell
              key={month}
              big={name}
              selected={month === value}
              today={month === monthOf(today)}
              accent={accent}
              label={`${name} ${year}`}
              onPick={() => onPick(month)}
            />
          )
        })}
      </div>
    </div>
  )
}
