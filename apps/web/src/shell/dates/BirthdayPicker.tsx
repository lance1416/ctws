import { HOUR_BRANCHES, LUNAR_DAYS, LUNAR_MONTHS } from '@ctws/core'
import { radioKeys } from '../../platform/ui/radioKeys'
import { useEffect, useState, type ReactNode } from 'react'
import { KIND_ICON, NewIcon } from '../../platform/ui/icons'
import { boxed } from '../../platform/ui/formStyles'
import { PickOne } from '../../platform/ui/inline'
import { DayGrid, LunarGrid, monthOf } from './grids'

/** A birthday as the picker holds it: the calendar it was given in, the year if known. */
export type BirthdayPick = {
  calendar: 'solar' | 'lunar'
  year: number | null
  month: number
  day: number
  leapMonth: boolean
  hourBranch: number | null
}

const pad = (n: number) => String(n).padStart(2, '0')

/**
 * The lunar year a picked day belongs to. A lunar year starts in late January or February, so the
 * eleventh and twelfth months run on into the next solar year's first weeks: 十二月三十 of 1944
 * is 12 February 1945.
 */
export function lunarYearOf(solar: string, lunarMonth: number): number {
  const year = Number(solar.slice(0, 4))
  return lunarMonth >= 11 && Number(solar.slice(5, 7)) <= 3 ? year - 1 : year
}

/**
 * THE BIRTHDAY PICKER (FR-034, artboard 11): the shared grid with a Solar / Lunar switch that
 * changes the grid itself; "Year not known" keeps only the month and day; the hour (时辰) waits
 * under the grid, folded. What the pick means (its other calendar, the sign, whether it exists)
 * is the server's sentence, given by the caller as `facts`.
 */
export function BirthdayPicker({
  value,
  onChange,
  today,
  facts,
  solarOfPick = null,
  picked = true,
}: {
  value: BirthdayPick
  /** `day` is true when a day was pointed at, not the calendar or the year changed. */
  onChange: (next: BirthdayPick, day: boolean) => void
  today: string
  /** The server's line about the pick: both calendars, this year's day, or why it cannot be. */
  facts?: ReactNode
  /**
   * The solar day the server says the pick falls on, when the year is known: a lunar grid moves
   * there, so typing a year shows that year's months (the client holds no lunar tables).
   */
  solarOfPick?: string | null
  /** False before any day is picked: nothing on the grid is chosen, and nothing is said of it. */
  picked?: boolean
}) {
  const yearKnown = value.year !== null
  const shownYear = value.year ?? Number(today.slice(0, 4))
  const solarDay =
    value.calendar === 'solar' ? `${shownYear}-${pad(value.month)}-${pad(value.day)}` : null
  const [month, setMonth] = useState(solarDay && picked ? monthOf(solarDay) : monthOf(today))
  // The lunar grid is anchored on a solar day; a pick moves the anchor onto itself.
  const [anchor, setAnchor] = useState(today)
  const [lunarSolar, setLunarSolar] = useState<string | null>(null)
  const [hourOpen, setHourOpen] = useState(value.hourBranch !== null)
  useEffect(() => {
    if (solarDay && picked) setMonth(monthOf(solarDay))
  }, [solarDay, picked])
  useEffect(() => {
    if (value.calendar !== 'lunar' || !solarOfPick) return
    setAnchor(solarOfPick)
    setLunarSolar(solarOfPick)
  }, [value.calendar, solarOfPick])

  const set = (patch: Partial<BirthdayPick>, day = false) => onChange({ ...value, ...patch }, day)

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center gap-2">
        <div
          role="radiogroup"
          onKeyDown={radioKeys}
          aria-label="Which calendar"
          className="inline-flex rounded-card bg-hover p-0.5"
        >
          {(['solar', 'lunar'] as const).map((c) => (
            <button
              key={c}
              type="button"
              role="radio"
              aria-checked={value.calendar === c}
              tabIndex={value.calendar === c ? 0 : -1}
              onClick={() => set({ calendar: c, leapMonth: c === 'lunar' && value.leapMonth })}
              className={`h-7 rounded-control px-2.5 text-meta font-medium ${
                value.calendar === c ? 'bg-panel text-ink ring-1 ring-line' : 'text-muted'
              }`}
            >
              {c === 'solar' ? 'Solar' : 'Lunar'}
            </button>
          ))}
        </div>
        <span aria-hidden="true" className="flex-1" />
        <label className="inline-flex items-center gap-2 text-ui text-ink">
          <input
            type="checkbox"
            checked={!yearKnown}
            onChange={(e) =>
              set({ year: e.target.checked ? null : Number(today.slice(0, 4)) - 30 })
            }
            className="size-4 accent-ink"
          />
          Year not known
        </label>
        {yearKnown && (
          <input
            value={value.year ?? ''}
            onChange={(e) => {
              const digits = e.target.value.replace(/\D/g, '').slice(0, 4)
              if (digits.length === 4) set({ year: Number(digits) })
            }}
            inputMode="numeric"
            aria-label="Year"
            className={`w-18 tabular-nums ${boxed}`}
          />
        )}
      </div>

      {value.calendar === 'solar' ? (
        <DayGrid
          month={month}
          setMonth={setMonth}
          value={picked ? solarDay : null}
          today={today}
          onPick={(day) => {
            const [y, m, d] = day.split('-').map(Number) as [number, number, number]
            set({ month: m, day: d, ...(yearKnown ? { year: y } : {}) }, true)
          }}
          accent="bg-person"
        />
      ) : (
        <LunarGrid
          anchor={anchor}
          setAnchor={setAnchor}
          value={picked ? lunarSolar : null}
          today={today}
          onPick={(p) => {
            setLunarSolar(p.solar)
            setAnchor(p.solar)
            set(
              {
                month: p.month,
                day: p.day,
                leapMonth: p.leapMonth,
                ...(yearKnown ? { year: lunarYearOf(p.solar, p.month) } : {}),
              },
              true,
            )
          }}
          accent="bg-person"
        />
      )}

      {picked && (
        <div className="grid grid-cols-[16px_6.5rem_minmax(0,1fr)] items-center gap-x-2.5 gap-y-1.5 rounded-control bg-person-bg px-2.5 py-2 text-ui">
          <KIND_ICON.person size={16} aria-hidden="true" className="text-person-t" />
          <span className="text-meta text-subtle">Every year on</span>
          <span className="font-medium text-person-t">
            {value.calendar === 'lunar'
              ? `${value.leapMonth ? '闰' : ''}${LUNAR_MONTHS[value.month - 1]}${LUNAR_DAYS[value.day - 1]}`
              : solarDay && sayMonthDay(solarDay)}
          </span>
          {facts}
        </div>
      )}

      <div className="flex items-center gap-3">
        {hourOpen ? (
          <PickOne
            label="时辰"
            value={value.hourBranch === null ? null : String(value.hourBranch)}
            choices={[
              { value: null, label: '时辰 — not known' },
              ...HOUR_BRANCHES.map((name, i) => ({ value: String(i), label: name })),
            ]}
            onPick={(next) => set({ hourBranch: next === null ? null : Number(next) })}
          />
        ) : (
          <button
            type="button"
            onClick={() => setHourOpen(true)}
            className="inline-flex items-center gap-1.5 text-meta font-medium text-muted hover:text-ink"
          >
            <NewIcon size={14} aria-hidden="true" />
            Hour
          </button>
        )}
      </div>
    </div>
  )
}

const MONTH_WORDS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
]
const sayMonthDay = (day: string) =>
  `${MONTH_WORDS[Number(day.slice(5, 7)) - 1]} ${Number(day.slice(8))}`
