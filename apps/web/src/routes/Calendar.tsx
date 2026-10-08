import type { CalendarEntry } from '@ctws/contracts'
import { useRef, useState, type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ViewTabs } from '../components/ViewTabs'
import { todayIn } from '../dueAt'
import { calendarProviders } from '../modules/registry'
import { monthRange, monthSquares, monthTitle, shiftMonth, WEEKDAYS } from '../monthGrid'
import { useProjectRail } from '../projectColor'
import { useTimeZone } from '../useMe'

/**
 * 日程 -- A SHELL SURFACE, and the first one that is about every module at once.
 *
 * The shell draws the grid; each module says what it has on which day. The shell does not know
 * what a 截止 is, nor how it differs from 想读完: a module hands over entries that already carry
 * their day and their own word for the date, and both are shown as given.
 *
 * WHAT v1 DOES NOT DO, deliberately: no drag to reschedule (「拖一个截止」 and 「拖一个排期」 are
 * not the same act and that has to be decided before it can be built), no week view, no time
 * axis (this app has no concept of a time slot -- a task has a day and a deadline instant), no
 * ics export. Each of those is a real feature, and none of them is needed to answer 「这个月有
 * 什么」.
 */

/** How many entries a square shows before it says 「+N」. Three is what fits without scrolling. */
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
  // ONE HOOK PER REGISTERED MODULE, over the registry's frozen list -- the same rule the capture
  // box and the rail counts follow.
  const results = providers.map((p) => ({ moduleId: p.moduleId, ...p.useEntries(range) }))
  // The modules that can MAKE something on a day. Most cannot: a deadline is a property of a
  // task, not something you arrange on a Tuesday.
  const makers = providers.map((p) => ({ moduleId: p.moduleId, maker: p.useCreate?.() ?? null }))
  const maker = makers.find((m) => m.maker)?.maker ?? null

  // 全部 plus one tab per module. A single module would mean a tab bar that decides nothing, so
  // it is drawn only when there is a choice to make -- the same rule the project blocks keep.
  const views = [
    { id: 'all', label: '全部' },
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
  // only about the day. A 14:00 meeting under a 「截止」 would be a square sorted by which module
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
          日程
        </h1>
        <span className="text-sm text-fg-muted tabular-nums">{monthTitle(cursor)}</span>
        <span className="flex items-center gap-1">
          <Step label="上个月" onClick={() => setCursor(shiftMonth(cursor, -1))}>
            ‹
          </Step>
          <Step label="回到本月" onClick={() => setCursor(today)}>
            本月
          </Step>
          <Step label="下个月" onClick={() => setCursor(shiftMonth(cursor, 1))}>
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
          有一部分日程没读到
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
                </div>
                {/* MAKING ONE HERE. A calendar you can only read is half a calendar, and
                    clicking an empty day is how every one of them has worked. It appears on
                    hover and on keyboard focus, so the squares stay quiet at rest. */}
                {maker && (
                  <button
                    type="button"
                    onClick={() => maker.create(day)}
                    aria-label={`在 ${day} ${maker.label}`}
                    className="absolute top-0.5 right-0.5 flex h-6 w-6 items-center justify-center rounded-lg text-fg-subtle opacity-0 group-hover:opacity-100 focus-visible:opacity-100 hover:bg-surface-hover hover:text-fg [@media(hover:none)]:opacity-100"
                  >
                    <svg aria-hidden="true" viewBox="0 0 16 16" className="h-3 w-3">
                      <path
                        d="M8 3.5v9M3.5 8h9"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                      />
                    </svg>
                  </button>
                )}
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
