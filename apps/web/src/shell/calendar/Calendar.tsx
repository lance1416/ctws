import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { addDays } from '@ctws/core/day'
import {
  useState,
  useSyncExternalStore,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { longDay, monthDay, ymd } from '../../platform/time/dates'
import { useNow } from '../../platform/time/useNow'
import { BUTTON, CHOSEN, ICON_BUTTON } from '../../platform/ui/buttonStyles'
import { DetailPane } from '../../platform/ui/DetailPane'
import {
  BackIcon,
  CakeIcon,
  DoneIcon,
  FlagIcon,
  ForwardIcon,
  KIND_ICON,
  RepeatIcon,
} from '../../platform/ui/icons'
import { KIND_ON_TINT, KIND_TINT } from '../../platform/ui/kinds'
import { useTimeZone } from '../auth/useMe'
import { useEveryProject } from '../projects/api'
import { ProjectSquare } from '../projects/ProjectSquare'
import { useInspector } from '../layout/inspectorAddress'
import { useRegistry } from '../registry'
import { lunarWindowQuery } from './api'
import { DayPanel } from './DayPanel'
import { PhoneCalendar } from './PhoneCalendar'
import { usePhone } from '../../platform/ui/phone'
import { dayParts, squareLines, type Placed } from './dayParts'
import { useLunarName } from './lunarName'
import {
  lunarMonthsOf,
  lunarSquareName,
  monthRange,
  monthSquares,
  monthTitle,
  shiftMonth,
  WEEKDAYS,
} from './monthGrid'

/** Lines a square shows before it says "+N more" (FR-015). */
const PER_SQUARE = 3
/**
 * From this window width the chosen day stays beside the grid: a square still has about 200 for
 * its names. Under it, a chosen day opens over the grid.
 */
const RESIDENT_QUERY = '(min-width: 1920px)'
const DAY = /^\d{4}-\d{2}-\d{2}$/

/** The arrow keys' steps through the grid, in days. */
const STEPS: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }

const subscribe = (change: () => void) => {
  const query = window.matchMedia(RESIDENT_QUERY)
  query.addEventListener('change', change)
  return () => query.removeEventListener('change', change)
}

/** Whether the window is wide enough for the chosen day to stay beside the grid. */
const useResident = () =>
  useSyncExternalStore(subscribe, () => window.matchMedia(RESIDENT_QUERY).matches)

/** The key above the grid: each kind of line, in its colour. */
const LEGEND = [
  { label: 'Meeting', swatch: 'bg-meeting' },
  { label: 'Due', swatch: 'bg-line-strong' },
  { label: 'Late', swatch: 'bg-stop' },
  { label: 'Birthday', swatch: 'bg-person' },
  { label: 'Follow up', swatch: 'bg-communication' },
] as const

/**
 * THE CALENDAR (FR-080, artboard 13): a month, Monday first, every module's dated things on their
 * days with each day's lunar name. A day's planned tasks are only counted; the chosen day lists
 * them, beside the grid on a wide screen and over it on a narrower one, where something can be
 * planned or a meeting made on it. Nothing is made in the grid: a meeting has its own page and a
 * deadline belongs to a task.
 */
export function Calendar() {
  return usePhone() ? <PhoneCalendar /> : <DeskCalendar />
}

function DeskCalendar() {
  const timeZone = useTimeZone()
  const today = ymd(useNow(), timeZone)
  const [params, setParams] = useSearchParams()
  const asked = params.get('day')
  const picked = asked && DAY.test(asked) ? asked : null
  const [cursor, setCursor] = useState(picked ?? today)
  const resident = useResident()
  const chosen = picked ?? (resident ? today : null)
  // The day the arrow keys are on: the grid is one Tab stop, and this day's number holds it.
  const [focused, setFocused] = useState(chosen ?? today)

  const setDay = (day: string | null) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        if (day) next.set('day', day)
        else next.delete('day')
        return next
      },
      { replace: true },
    )

  const registry = useRegistry()
  const providers = registry.calendar
  const inspector = useInspector()
  const range = monthRange(cursor)
  // Like every module's entries, the month stepped away from stays drawn until the next one is in;
  // a square whose lunar name failed to load simply has none.
  const lunar = useQuery({ ...lunarWindowQuery(range), placeholderData: keepPreviousData })
  const month = cursor.slice(0, 7)
  const lunarMonths = lunarMonthsOf(useLunarName(`${month}-01`), lunar.data?.days ?? {}, month)
  // One hook per registered module; the registry's list is fixed, so the hook order is too.
  const results = providers.map((p) => ({ moduleId: p.moduleId, ...p.useEntries(range) }))
  const failed = results.filter((r) => r.isError)
  const byDay = new Map<string, Placed[]>()
  for (const { moduleId, entries } of results)
    for (const entry of entries) {
      const list = byDay.get(entry.day)
      if (list) list.push({ ...entry, moduleId })
      else byDay.set(entry.day, [{ ...entry, moduleId }])
    }

  // An entry whose module opens it over the grid names it in the address; the rest are links.
  // What has a narrow page opens in the inspector, a meeting as the occurrence clicked (FR-022,
  // FR-067, DES-001 "日历"); else over the grid where its module opens it; else a link.
  const opener = (entry: Placed) => {
    if (registry.relationFor(entry.type).Narrow)
      return () =>
        inspector.show({
          type: entry.type,
          id: entry.id,
          ...(entry.recurrenceId ? { at: entry.recurrenceId } : {}),
        })
    const opens = providers.find((p) => p.moduleId === entry.moduleId)?.opens
    if (!opens) return null
    return () =>
      setParams((prev) => {
        const next = new URLSearchParams(prev)
        for (const [k, v] of Object.entries(opens.params(entry))) next.set(k, v)
        return next
      })
  }

  const squares = monthSquares(cursor)
  // The Tab stop: the day the arrows are on, or this month's first when it is on another month.
  const stop = squares.some((s) => s.day === focused)
    ? focused
    : (squares.find((s) => s.inMonth)?.day ?? focused)
  // The arrows move the day; off this month's squares the month follows. Beside the grid the
  // moved-to day is chosen at once; over it, Enter opens it.
  const onGridKey = (e: KeyboardEvent) => {
    const step = STEPS[e.key]
    if (step === undefined) return
    e.preventDefault()
    const next = addDays(stop, step)
    setFocused(next)
    if (resident) setDay(next)
    if (!squares.some((s) => s.day === next && s.inMonth)) setCursor(next)
    requestAnimationFrame(() =>
      document.querySelector<HTMLElement>(`[data-day="${next}"] [data-day-number]`)?.focus(),
    )
  }
  // Over the grid, closing hands focus back to the square that opened it (CA-01).
  const closeDay = () => {
    const was = chosen
    setDay(null)
    requestAnimationFrame(() =>
      document.querySelector<HTMLElement>(`[data-day="${was}"] [data-day-number]`)?.focus(),
    )
  }
  const panel = chosen && (
    <DayPanel
      day={chosen}
      today={today}
      parts={dayParts(byDay.get(chosen) ?? [])}
      opener={opener}
      {...(resident ? {} : { onClose: closeDay })}
    />
  )

  return (
    <div className="flex min-h-full flex-1 flex-col gap-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <h1 className="text-title text-ink tabular-nums">{monthTitle(cursor)}</h1>
        {lunarMonths.map((name) => (
          <span
            key={name}
            data-lunar-month-name
            className="inline-flex h-5.5 items-center rounded-key bg-hover px-2 text-meta text-muted"
          >
            {name}
          </span>
        ))}
        <span className="ml-2 flex items-center gap-1">
          <button
            type="button"
            aria-label="Previous month"
            onClick={() => setCursor(shiftMonth(cursor, -1))}
            className={ICON_BUTTON}
          >
            <BackIcon size={16} aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => {
              setCursor(today)
              setFocused(today)
              setDay(today)
            }}
            className={`${BUTTON.secondary} h-8`}
          >
            Today
          </button>
          <button
            type="button"
            aria-label="Next month"
            onClick={() => setCursor(shiftMonth(cursor, 1))}
            className={ICON_BUTTON}
          >
            <ForwardIcon size={16} aria-hidden="true" />
          </button>
        </span>
        <ul aria-label="Key" className="ml-auto flex flex-wrap items-center gap-x-3 gap-y-1">
          {LEGEND.map(({ label, swatch }) => (
            <li key={label} className="flex items-center gap-1.5 text-meta text-muted">
              <span aria-hidden="true" className={`size-2.5 rounded-[3px] ${swatch}`} />
              {label}
            </li>
          ))}
        </ul>
      </div>

      {failed.length > 0 && (
        <p role="alert" className="flex items-center gap-2 text-ui text-stop-t">
          Some entries failed to load
          <button
            type="button"
            onClick={() => failed.forEach((r) => r.retry())}
            className={BUTTON.inline}
          >
            Try again
          </button>
        </p>
      )}

      <div
        className={`grid min-h-0 flex-1 gap-3 ${resident ? 'grid-cols-[minmax(0,1fr)_var(--width-inspector)]' : ''}`}
      >
        <div
          aria-label={monthTitle(cursor)}
          onKeyDown={onGridKey}
          className="grid min-w-0 grid-cols-7 overflow-hidden rounded-card border border-line bg-panel"
          style={{
            gridTemplateRows: `2rem repeat(${squares.length / 7}, minmax(7.5rem, 1fr))`,
          }}
        >
          {WEEKDAYS.map((w, i) => (
            <span
              key={w}
              className={`flex items-center border-b border-line px-3 text-meta font-medium text-subtle ${
                i < 6 ? 'border-r' : ''
              }`}
            >
              {w}
            </span>
          ))}
          {squares.map(({ day, inMonth }, i) => (
            <Square
              key={day}
              day={day}
              inMonth={inMonth}
              isToday={day === today}
              chosen={day === chosen}
              focusable={day === stop}
              last={{ column: i % 7 === 6, row: i >= squares.length - 7 }}
              lunar={lunarSquareName(lunar.data?.days[day], lunar.data?.festivals[day])}
              entries={byDay.get(day) ?? []}
              today={today}
              onPick={() => {
                setFocused(day)
                setDay(day)
              }}
              opener={opener}
            />
          ))}
        </div>
        {resident && panel && (
          <aside
            aria-label={longDay(chosen)}
            className="min-w-0 self-start overflow-hidden rounded-card border border-line bg-panel"
          >
            {panel}
          </aside>
        )}
      </div>

      {!resident && panel && (
        <DetailPane label={longDay(chosen)} onClose={closeDay}>
          {panel}
        </DetailPane>
      )}
      {providers.map(({ moduleId, opens }) => opens && <opens.Pane key={moduleId} />)}
    </div>
  )
}

function Square({
  day,
  inMonth,
  isToday,
  chosen,
  focusable,
  last,
  lunar,
  entries,
  today,
  onPick,
  opener,
}: {
  day: string
  inMonth: boolean
  isToday: boolean
  chosen: boolean
  /** The grid's one Tab stop. */
  focusable: boolean
  last: { column: boolean; row: boolean }
  lunar: ReturnType<typeof lunarSquareName>
  entries: Placed[]
  today: string
  onPick: () => void
  opener: (entry: Placed) => (() => void) | null
}) {
  const parts = dayParts(entries)
  const lines = squareLines(parts)
  // Clicking anywhere on a square chooses its day, except on a line, which opens its thing; the
  // day's number is the button that does it from the keyboard.
  return (
    <div
      data-day={day}
      onClick={onPick}
      className={`flex min-h-0 min-w-0 cursor-default flex-col gap-1 overflow-hidden px-2.5 py-2 ${
        last.column ? '' : 'border-r'
      } ${last.row ? '' : 'border-b'} border-line ${inMonth ? '' : 'bg-chrome'} ${
        chosen ? 'shadow-[inset_0_0_0_2px_var(--color-ink)]' : ''
      }`}
    >
      <div className={`mb-0.5 flex items-baseline justify-between ${inMonth ? '' : 'opacity-55'}`}>
        <button
          type="button"
          data-day-number
          tabIndex={focusable ? 0 : -1}
          aria-label={longDay(day)}
          aria-pressed={chosen}
          aria-current={isToday ? 'date' : undefined}
          className="text-prose font-medium tabular-nums text-ink"
        >
          <span
            className={
              isToday ? `inline-grid h-6.5 min-w-6.5 place-items-center rounded-full ${CHOSEN}` : ''
            }
          >
            {!inMonth && day.endsWith('-01') ? monthDay(day) : Number(day.slice(8))}
          </span>
        </button>
        {lunar && (
          <span
            data-lunar-day
            className={`text-meta ${
              lunar.is === 'festival'
                ? 'font-medium text-person-t'
                : lunar.is === 'month'
                  ? 'font-medium text-ink'
                  : 'text-subtle'
            }`}
          >
            {lunar.text}
          </span>
        )}
      </div>
      {lines.slice(0, PER_SQUARE).map((entry) => (
        <Line key={entry.key} entry={entry} today={today} open={opener(entry)} />
      ))}
      {lines.length > PER_SQUARE && (
        <span className="pl-1.5 text-meta text-subtle">{`+${lines.length - PER_SQUARE} more`}</span>
      )}
      {parts.planned.length > 0 && (
        <span data-planned className="pl-1.5 text-meta text-subtle">
          {`${parts.planned.length} planned`}
        </span>
      )}
    </div>
  )
}

/**
 * How a line looks, by what its date is to the thing: late is red, due today amber, a deadline
 * met struck through and quiet.
 */
function lineLook(entry: Placed, today: string): { tone: string; icon: ReactNode } {
  const late = entry.day < today
  const icon = (Icon: typeof FlagIcon) => <Icon size={12} aria-hidden="true" />
  switch (entry.kind) {
    case 'occurrence':
      return {
        tone: `${KIND_TINT.meeting} ${KIND_ON_TINT.meeting}`,
        icon: icon(entry.repeats ? RepeatIcon : KIND_ICON.meeting),
      }
    case 'follow-up':
      return {
        tone: late
          ? 'bg-stop-bg text-stop-t'
          : `${KIND_TINT.communication} ${KIND_ON_TINT.communication}`,
        icon: icon(KIND_ICON.communication),
      }
    case 'due':
      if (entry.done) return { tone: 'text-subtle line-through', icon: icon(DoneIcon) }
      return {
        tone: late
          ? 'bg-stop-bg text-stop-t'
          : entry.day === today
            ? 'bg-warn-bg text-warn-t'
            : 'bg-hover text-muted',
        icon: icon(FlagIcon),
      }
    case 'birthday':
      return { tone: `${KIND_TINT.person} ${KIND_ON_TINT.person}`, icon: icon(CakeIcon) }
    default:
      return { tone: 'bg-hover text-muted', icon: icon(FlagIcon) }
  }
}

/** One thing on a square: its mark, a meeting's time, its name, its project's square. */
function Line({ entry, today, open }: { entry: Placed; today: string; open: (() => void) | null }) {
  const projects = useEveryProject()
  const project = entry.projectId ? projects.data?.find((p) => p.id === entry.projectId) : null
  const look = lineLook(entry, today)
  const className = `grid h-6 min-w-0 shrink-0 grid-cols-[12px_auto_minmax(0,1fr)_auto] items-center gap-x-1.5 rounded-key px-1.5 text-left text-meta font-medium hover:brightness-95 ${look.tone}`
  const stop = (e: MouseEvent) => e.stopPropagation()
  const body = (
    <>
      {look.icon}
      <span className="font-mono tabular-nums">{entry.kind === 'occurrence' && entry.time}</span>
      <span className="truncate">
        {entry.title}
        {/* The zone it was agreed in, when that is not the account's: whose time it is. */}
        {entry.zone && <span className="font-normal"> {entry.zone}</span>}
      </span>
      {project ? <ProjectSquare project={project} /> : <span />}
      {entry.projectName && <span className="sr-only">, {entry.projectName}</span>}
    </>
  )
  return open ? (
    <button
      type="button"
      // The grid is one Tab stop (BUG-057): from the keyboard, Enter opens the day, which lists it.
      tabIndex={-1}
      data-entry={entry.kind}
      title={entry.title}
      onClick={(e) => {
        stop(e)
        open()
      }}
      className={className}
    >
      {body}
    </button>
  ) : (
    <Link
      to={entry.to}
      tabIndex={-1}
      data-entry={entry.kind}
      title={entry.title}
      onClick={stop}
      className={className}
    >
      {body}
    </Link>
  )
}
