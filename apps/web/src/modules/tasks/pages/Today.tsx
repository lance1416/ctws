import type { TaskId, TodayTaskResponse } from '@ctws/contracts'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { addDays } from '@ctws/core/day'
import { clockTime } from '@ctws/core/clock'
import { useQuery } from '@tanstack/react-query'
import { useRef, useState, type CSSProperties } from 'react'
import { longDay, nextMonday, ymd } from '../../../platform/time/dates'
import { useNow } from '../../../platform/time/useNow'
import { Block, BlockFailed, SkeletonRows } from '../../../platform/ui/Block'
import { BUTTON } from '../../../platform/ui/buttonStyles'
import { inColumns, splitColumns, useColumns } from '../../../platform/ui/columns'
import {
  CarriedIcon,
  ExpandIcon,
  FlagIcon,
  InProgressIcon,
  PLACE_ICON,
} from '../../../platform/ui/icons'
import { MENU_ITEM, MENU_SURFACE } from '../../../platform/ui/menuSurface'
import { useTimeZone } from '../../../shell/auth'
import { useLunarName } from '../../../shell/calendar'
import { DayPickButton } from '../../../shell/dates'
import { useRegistry } from '../../../shell/registry'
import { dueTodayAt } from '../../../shell/rows'
import { readyQuery, todayQuery } from '../api'
import { TaskDetail } from '../components/TaskDetail'
import { useTaskParam } from '../components/tree/useTreeParams'
import { useSavedFlash } from '../components/useSavedFlash'
import { carriedFrom } from '../logic/todayMarks'
import { todaySegments } from '../logic/today'
import { DoneButton, LINE, TaskLine, TaskPath } from './today/TaskLine'
import { Timeline } from './today/Timeline'
import { minutesOf, type TimedItem } from './today/dayLine'
import { useOthersToday, useTodayRows } from './today/useTodayRows'

/** Overdue shows this many before its "All 12" (FR-079). */
const OVERDUE_SHOWN = 5

/**
 * TODAY (FR-079, artboard 12): what to move next. The day on one timeline across the top; then, on
 * the left, what is in progress, what is planned and what is late, all in one set of columns; on
 * the right, the blocks the modules add: follow up, ready to start, this week, birthdays.
 */
export function Today() {
  const timeZone = useTimeZone()
  // Kept current while the page sits open: the now line, the date and which day is today follow
  // it, and so do the server's lists, keyed by the day.
  const now = useNow()
  const day = ymd(now, timeZone)
  const today = useQuery(todayQuery(day))
  const others = useOthersToday(day)
  const registry = useRegistry()
  const lunar = useLunarName(day)
  // In the address, as on a project page: opening another row is a navigation, which the open
  // pane's unsaved-edit guard sees.
  const { openId, setOpenId } = useTaskParam()
  const rows = today.data ?? []

  const [error, setError] = useState<string | null>(null)
  const [savedId, setSavedId] = useSavedFlash()
  const { titles, pane, setStatus, patch, onRowKeyDown } = useTodayRows({
    rows,
    settled: today.isSuccess,
    openId,
    setOpenId,
    setError,
  })
  const { openTask } = pane
  const { inProgress, planned, overdue } = todaySegments(rows)

  // Not held to a width: the page's columns are what its width gives (DES-001 section 4).
  const page = useRef<HTMLDivElement>(null)
  const columns = useColumns(page)
  const { main: taskColumns, side } = splitColumns(columns)
  const sideColumns = inColumns(registry.todayBlocks, side)

  // The timed things: meetings from their module, and deadlines today at a time.
  const nowClock = clockTime(now, timeZone)
  const timed: TimedItem[] = [
    ...others.entries.flatMap((e): TimedItem[] =>
      e.type === 'meeting' && e.time
        ? [
            {
              key: e.key,
              kind: 'meeting',
              title: e.title,
              start: minutesOf(e.time),
              end: e.endTime ? minutesOf(e.endTime) : undefined,
              joinUrl: e.joinUrl,
              to: e.to,
            },
          ]
        : [],
    ),
    ...[...inProgress, ...planned].flatMap((t): TimedItem[] => {
      const at = dueTodayAt(t.dueAt, day, timeZone)
      return at ? [{ key: `task:${t.id}`, kind: 'due', title: t.title, start: minutesOf(at) }] : []
    }),
  ]

  const line = (t: TodayTaskResponse, action: React.ReactNode) => (
    <TaskLine
      key={t.id}
      task={t}
      today={day}
      timeZone={timeZone}
      saved={savedId === t.id}
      rowRef={titles.ref(t.id)}
      onOpen={() => setOpenId(t.id)}
      onKeyDown={(e) => onRowKeyDown(e, t)}
      onStatus={(status) => setStatus(t.id, status)}
      action={action}
    />
  )

  return (
    <div ref={page} className="flex w-full flex-col gap-3.5">
      <header className="flex items-center gap-3.5">
        <h1
          id="today-heading"
          tabIndex={-1}
          className="text-title tracking-[-0.01em] text-ink focus:outline-none"
        >
          {longDay(day)}
        </h1>
        {lunar && (
          <span
            data-lunar-day
            className="inline-flex h-5.5 items-center rounded-control bg-hover px-2 text-meta text-muted"
          >
            {lunar}
          </span>
        )}
        <span aria-hidden="true" className="flex-1" />
        <span data-now-clock className="font-mono text-ui text-muted">
          {nowClock}
        </span>
      </header>

      <Timeline
        items={timed}
        nowMinutes={minutesOf(nowClock)}
        failed={others.failed}
        onRetry={others.retry}
      />

      {error && (
        <p role="alert" className="text-ui text-stop-t">
          {error}
        </p>
      )}

      <div
        data-today-columns={columns}
        className="grid min-w-0 grid-cols-1 items-start gap-3 lg:grid-cols-[repeat(var(--columns),minmax(0,1fr))]"
        style={{ '--columns': columns, '--tasks': taskColumns } as CSSProperties}
      >
        <div className="flex min-w-0 flex-col gap-3 lg:col-span-(--tasks)">
          {today.isError ? (
            <Block title="Today">
              <BlockFailed what="tasks for today" onRetry={() => void today.refetch()} />
            </Block>
          ) : today.isPending ? (
            <Block title="In progress">
              <SkeletonRows rows={3} />
            </Block>
          ) : (
            <>
              {/* Left column blocks keep their order and are not drawn empty (FR-079). */}
              {inProgress.length > 0 && (
                <Block
                  badge={{ icon: InProgressIcon, tint: 'bg-go-bg text-go' }}
                  title="In progress"
                  count={inProgress.length}
                >
                  <ul className="p-1.5">
                    {inProgress.map((t) =>
                      line(
                        t,
                        <DoneButton
                          id={t.id}
                          title={t.title}
                          onDone={() => setStatus(t.id, 'done')}
                        />,
                      ),
                    )}
                  </ul>
                </Block>
              )}

              <PlannedBlock
                planned={planned}
                listed={rows}
                day={day}
                line={line}
                onPlan={(id) => patch(id, { scheduledOn: day })}
              />

              {overdue.length > 0 && (
                <OverdueBlock
                  overdue={overdue}
                  day={day}
                  line={line}
                  onMove={(id, to) => patch(id, { dueAt: null, scheduledOn: to })}
                />
              )}
            </>
          )}
        </div>

        {sideColumns.map((blocks) => (
          <div
            key={`${blocks[0]!.moduleId}:${blocks[0]!.id}`}
            data-today-side
            className="flex min-w-0 flex-col gap-3"
          >
            {blocks.map(({ moduleId, id, Block: Part }) => (
              <Part key={`${moduleId}:${id}`} today={day} />
            ))}
          </div>
        ))}
      </div>

      {openTask && (
        <TaskDetail
          key={openTask.id}
          task={openTask}
          onClose={pane.close}
          // Marks the row. A save that takes the task off this page closes the pane with it, as on
          // every list (`useRowPane`).
          onSaved={() => setSavedId(openTask.id)}
        />
      )}
    </div>
  )
}

type Line = (t: TodayTaskResponse, action: React.ReactNode) => React.ReactNode

/**
 * PLANNED FOR TODAY: planned for today with no time of its own, and plans carried over from a day
 * already gone, said on the right. With nothing planned, the tasks ready to start, each with Plan
 * (FR-030).
 */
function PlannedBlock({
  planned,
  listed,
  day,
  line,
  onPlan,
}: {
  planned: TodayTaskResponse[]
  /** Everything on Today's lists, which is not offered again. */
  listed: readonly TodayTaskResponse[]
  day: string
  line: Line
  onPlan: (id: TaskId) => void
}) {
  const ready = useQuery({ ...readyQuery(day), enabled: planned.length === 0 })
  const badge = { icon: PLACE_ICON.calendar, tint: 'bg-hover text-muted' }
  if (planned.length === 0)
    return (
      <Block badge={badge} title="Planned for today" count="Nothing yet">
        <ul className="p-1.5">
          {(ready.data ?? [])
            .filter((t) => !listed.some((l) => l.id === t.id))
            .slice(0, OVERDUE_SHOWN)
            .map((t) => (
              <li key={t.id} data-plan-row={t.id} className={LINE}>
                <PLACE_ICON.calendar size={16} aria-hidden="true" className="text-subtle" />
                <span className="truncate text-ui text-ink">{t.title}</span>
                <TaskPath task={{ ...t, parentTitle: t.path.at(-1)?.title ?? null }} />
                <span className="max-lg:hidden" />
                <button
                  type="button"
                  onClick={() => onPlan(t.id)}
                  aria-label={`Plan “${t.title}” for today`}
                  className={`${BUTTON.secondary} h-6.5 justify-self-end px-2.5 text-meta`}
                >
                  Plan
                </button>
              </li>
            ))}
        </ul>
      </Block>
    )
  return (
    <Block badge={badge} title="Planned for today" count={planned.length}>
      <ul className="p-1.5">
        {planned.map((t) =>
          line(
            t,
            t.scheduledOn !== null && t.scheduledOn < day ? (
              <span
                data-date-hint="carried"
                className="inline-flex items-center gap-1 text-meta whitespace-nowrap text-subtle"
              >
                <CarriedIcon size={12} aria-hidden="true" />
                {carriedFrom(t.scheduledOn, day)}
              </span>
            ) : null,
          ),
        )}
      </ul>
    </Block>
  )
}

/**
 * OVERDUE: what is late, how late, and the days it can move to, which make it a plan (FR-079):
 * Today, Tomorrow, next Monday, or a day picked. Past five, the head moves them all at once. A
 * parent has no plan of its own (FR-043): its row offers no day, and moving them all passes it
 * by; it is opened to change its deadline or to get on with what is under it.
 */
function OverdueBlock({
  overdue,
  day,
  line,
  onMove,
}: {
  overdue: TodayTaskResponse[]
  day: string
  line: Line
  onMove: (id: TaskId, to: string) => void
}) {
  const [all, setAll] = useState(false)
  const monday = nextMonday(day)
  const days = [
    { label: 'Today', to: day },
    { label: 'Tomorrow', to: addDays(day, 1) },
    { label: 'Mon', to: monday },
  ]
  const shown = all ? overdue : overdue.slice(0, OVERDUE_SHOWN)
  return (
    <Block
      badge={{ icon: FlagIcon, tint: 'bg-stop-bg text-stop' }}
      title="Overdue"
      count={overdue.length}
      actions={
        overdue.length > OVERDUE_SHOWN && (
          <DropdownMenu.Root>
            <DropdownMenu.Trigger className={`${BUTTON.quiet} h-7 px-2.5 text-meta`}>
              Move all to…
              <ExpandIcon size={12} aria-hidden="true" />
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content align="end" sideOffset={6} className={MENU_SURFACE}>
                {days.map((d) => (
                  <DropdownMenu.Item
                    key={d.label}
                    onSelect={() =>
                      overdue.filter((t) => !t.children).forEach((t) => onMove(t.id, d.to))
                    }
                    className={MENU_ITEM}
                  >
                    {d.label === 'Mon' ? 'Next Monday' : d.label}
                  </DropdownMenu.Item>
                ))}
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
        )
      }
    >
      <ul className="p-1.5">
        {shown.map((t) =>
          line(
            t,
            <span className="inline-flex items-center gap-1">
              {days.map((d) => (
                <button
                  key={d.label}
                  type="button"
                  onClick={() => onMove(t.id, d.to)}
                  aria-label={`Plan “${t.title}” for ${d.label === 'Mon' ? 'next Monday' : d.label.toLocaleLowerCase()}`}
                  className="inline-flex h-6.5 items-center rounded-control border border-line bg-panel px-2 text-meta font-medium text-ink hover:bg-hover"
                >
                  {d.label}
                </button>
              ))}
              <DayPickButton
                label={`Plan “${t.title}” for another day`}
                today={day}
                onPick={(to) => onMove(t.id, to)}
              />
            </span>,
          ),
        )}
      </ul>
      {overdue.length > OVERDUE_SHOWN && (
        <button
          type="button"
          onClick={() => setAll(!all)}
          className="flex h-9 w-full items-center border-t border-line px-4 text-ui text-muted hover:bg-hover hover:text-ink"
        >
          {all ? 'Fewer' : `All ${overdue.length}`}
        </button>
      )}
    </Block>
  )
}
