import type { CalendarEntry } from '@ctws/contracts'
import { useRef, useState, type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ViewTabs } from '../components/ViewTabs'
import { useQuery } from '@tanstack/react-query'
import { calendarDays } from '../api/birthdays'
import { todayIn } from '../dueAt'
import { calendarProviders } from '../modules/registry'
import { monthRange, monthSquares, monthTitle, shiftMonth, WEEKDAYS } from '../monthGrid'
import { useProjectRail } from '../projectColor'
import { useTimeZone } from '../useMe'

/**
 * THE CALENDAR -- a SHELL SURFACE, and the first one that is about every module at once.
 *
 * A LENS, not a place things live. It answers what is on this month by laying every module's
 * dated things on one grid; it owns none of them, and it is not where any of them is made. In a
 * calendar app an event is the only entity, so a "+" on the day square is the obvious way to make
 * one; here a meeting has its own page and a deadline is a property of a task, so making anything
 * from the grid would be a lens claiming a kind of thing (framing §2).
 *
 * The shell draws the grid; each module says what it has on which day. The shell does not know
 * what a deadline is, nor how it differs from a day you mean to finish something: a module hands
 * over entries that already carry their day and their own word for the date, and both are shown
 * as given.
 *
 * WHAT IT DOES NOT DO, deliberately: no drag to reschedule (dragging a deadline and dragging a
 * plan are not the same act, and that has to be decided before it can be built), no week view, no
 * time axis (this app has no concept of a time slot -- a task has a day and a deadline instant),
 * no ics export. Each of those is a real feature, and none is needed to answer what is on which
 * day this month.
 */

/** How many entries a square shows before it says "+N". Three fits without scrolling. */
const PER_SQUARE = 3

export function Calendar() {
  const timeZone = useTimeZone()
  const today = todayIn(timeZone)
  const [cursor, setCursor] = useState(today)
  /** Which entry is open, and whose it is -- the module renders it, the shell only remembers. */
  const [open, setOpen] = useState<{ moduleId: string; id: string } | null>(null)
  const [params, setParams] = useSearchParams()
  const heading = useRef<HTMLHeadingElement>(null)
  const rail = useProjectRail()

  const providers = calendarProviders()
  const range = monthRange(cursor)
  /**
   * WHAT EACH DAY IS CALLED IN THE OLD CALENDAR. One request per month, from the shell's own
   * endpoint: a day's name belongs to the day, not to whichever module put something on it. A
   * square whose label has not arrived (or failed) simply has no label, and is still a square.
   */
  const lunar = useQuery({
    queryKey: ['calendar-days', range.from, range.to],
    queryFn: () => calendarDays(range),
  })
  // ONE HOOK PER REGISTERED MODULE, over the registry's frozen list -- the same rule the capture
  // box and the rail counts follow.
  const results = providers.map((p) => ({ moduleId: p.moduleId, ...p.useEntries(range) }))
  // All, plus one tab per module. A single module would mean a tab bar that decides nothing, so
  // it is drawn only when there is a choice to make -- the same rule the project blocks keep.
  const views = [
    { id: 'all', label: 'All' },
    ...providers.map((p) => ({ id: p.moduleId, label: p.label })),
  ]
  const view = views.find((v) => v.id === params.get('view'))?.id ?? 'all'
  const pickView = (next: string) => {
    const copy = new URLSearchParams(params)
    if (next === 'all') copy.delete('view')
    else copy.set('view', next)
    setParams(copy, { replace: true })
  }

  const shown = results.filter((r) => view === 'all' || r.moduleId === view)
  const failed = shown.some((r) => r.isError)
  type Placed = CalendarEntry & { moduleId: string }
  const byDay = new Map<string, Placed[]>()
  for (const { moduleId, entries } of shown) {
    for (const entry of entries) {
      const placed = { ...entry, moduleId }
      const list = byDay.get(entry.day)
      if (list) list.push(placed)
      else byDay.set(entry.day, [placed])
    }
  }
  // Inside a square: the things with a clock first and in clock order, then the things that are
  // only about the day. A 14:00 meeting under a “Due” would be a square sorted by which module
  // answered first.
  for (const list of byDay.values()) {
    list.sort(
      (a, b) => (a.time ?? '99').localeCompare(b.time ?? '99') || a.title.localeCompare(b.title),
    )
  }

  const squares = monthSquares(cursor)

  return (
    <>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <h1 ref={heading} tabIndex={-1} className="text-xl font-semibold focus:outline-none">
          Calendar
        </h1>
        <span className="text-sm text-fg-muted tabular-nums">{monthTitle(cursor)}</span>
        <span className="flex items-center gap-1">
          <Step label="Previous month" onClick={() => setCursor(shiftMonth(cursor, -1))}>
            ‹
          </Step>
          <Step label="Back to this month" onClick={() => setCursor(today)}>
            This month
          </Step>
          <Step label="Next month" onClick={() => setCursor(shiftMonth(cursor, 1))}>
            ›
          </Step>
        </span>
        {views.length > 2 && (
          <span className="ml-auto">
            <ViewTabs views={views} current={view} onPick={pickView} />
          </span>
        )}
      </div>

      {failed && (
        <p role="alert" className="mt-3 text-sm text-danger">
          Some entries failed to load
        </p>
      )}

      <div className="mt-4 min-w-0 overflow-hidden rounded-xl border border-border-subtle bg-surface-panel shadow-panel">
        <div className="grid grid-cols-7">
          {WEEKDAYS.map((w) => (
            <div key={w} className="px-2 py-1.5 text-xs text-fg-subtle">
              {w}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 border-t border-border-subtle">
          {squares.map(({ day, inMonth }, i) => {
            const entries = byDay.get(day) ?? []
            const isToday = day === today
            return (
              <div
                key={day}
                aria-label={day}
                data-day={day}
                className={`group relative min-h-24 min-w-0 border-border-subtle p-1 ${
                  i % 7 === 6 ? '' : 'border-r'
                } ${i < squares.length - 7 ? 'border-b' : ''} ${inMonth ? '' : 'bg-surface'}`}
              >
                <div
                  className={`px-1 text-xs tabular-nums ${
                    isToday
                      ? 'font-semibold text-accent'
                      : inMonth
                        ? 'text-fg-muted'
                        : 'text-fg-subtle'
                  }`}
                >
                  {Number(day.slice(8))}
                  {lunar.data?.[day] && (
                    <span
                      data-lunar-day
                      className={`ml-1.5 text-[11px] ${inMonth ? 'text-fg-subtle' : 'text-fg-subtle/70'}`}
                    >
                      {lunar.data[day]}
                    </span>
                  )}
                </div>
                <ul className="flex flex-col">
                  {entries.slice(0, PER_SQUARE).map((entry) => (
                    <li key={entry.id} className="min-w-0">
                      <EntryLink
                        entry={entry}
                        onOpen={() => setOpen({ moduleId: entry.moduleId, id: entry.id })}
                        opens={providers.some(
                          (p) => p.moduleId === entry.moduleId && p.Detail !== undefined,
                        )}
                      >
                        {/* The project's identity colour. A calendar is cross-project by nature,
                            which is exactly where this chip earns its place -- and it is never
                            alone, because the title is beside it (WCAG 1.4.1). */}
                        {/* The slot is reserved whether or not the entry has a project, so every
                            title in a square starts at the same x -- the rule the task rows keep
                            about their leading glyph. */}
                        <span
                          aria-hidden="true"
                          className={`h-3 w-[3px] shrink-0 rounded-full ${
                            entry.projectId ? rail(entry.projectId) : ''
                          }`}
                        />
                        {entry.time && (
                          <span className="shrink-0 text-xs tabular-nums text-fg-muted">
                            {entry.time}
                          </span>
                        )}
                        <span className="truncate text-xs text-fg">{entry.title}</span>
                        {/* The zone it was AGREED in, when that is not the one the clock above is
                            in. The time says when to turn up; this says what was actually said. */}
                        {entry.zone && (
                          <span className="shrink-0 text-[10px] text-fg-subtle">{entry.zone}</span>
                        )}
                      </EntryLink>
                    </li>
                  ))}
                  {entries.length > PER_SQUARE && (
                    <li className="px-1 text-xs text-fg-subtle">+{entries.length - PER_SQUARE}</li>
                  )}
                </ul>
              </div>
            )
          })}
        </div>
      </div>

      {providers.map(({ moduleId, Detail }) =>
        Detail && open?.moduleId === moduleId ? (
          <Detail key={moduleId} id={open.id} onClose={() => setOpen(null)} />
        ) : null,
      )}
    </>
  )
}

/**
 * An entry on the grid: a BUTTON when its module opens it here, a LINK when the thing belongs
 * somewhere else. A deadline is a property of a task and the task's list is where you deal with
 * it; a meeting has nowhere else to be.
 */
function EntryLink({
  entry,
  opens,
  onOpen,
  children,
}: {
  entry: CalendarEntry
  opens: boolean
  onOpen: () => void
  children: ReactNode
}) {
  const title = `${entry.kind} · ${entry.title}`
  const className =
    'flex w-full min-w-0 items-center gap-1 rounded px-1 py-0.5 text-left hover:bg-surface-hover'
  return opens ? (
    <button type="button" onClick={onOpen} title={title} className={className}>
      {children}
    </button>
  ) : (
    <Link to={entry.to} title={title} className={className}>
      {children}
    </Link>
  )
}

function Step({
  label,
  onClick,
  children,
}: {
  label: string
  onClick: () => void
  children: string
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="flex h-7 min-w-7 items-center justify-center rounded-lg border border-border-subtle px-1.5 text-xs text-fg-muted hover:bg-surface hover:text-fg"
    >
      {children}
    </button>
  )
}
