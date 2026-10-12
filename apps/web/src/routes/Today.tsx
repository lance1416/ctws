import type { TaskStatus, TodayTaskResponse } from '@ctws/contracts'
import { useQuery } from '@tanstack/react-query'
import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { listCompleted } from '../api/completed'
import { toggleDoneTarget, toggleStartTarget, useTaskActions } from '../api/taskActions'
import { listToday } from '../api/today'
import { listMovement } from '../api/movement'
import { DoneTodayPanel } from '../components/DoneTodayPanel'
import { MovementPanel } from '../components/MovementPanel'
import { hasMovement } from '../movement'
import { Panel, PanelEmpty } from '../components/Panel'
import { blockedLabel } from '../blockedLabel'
import { LeadMark, ProjectRail, RowMeta, SavedMark, ROW_LIST } from '../components/RowParts'
import { hasLeadSlot, leadIcon } from '../rowLead'
import { EmptyState } from '../components/EmptyState'
import { StartButton, StatusButton, statusForKey } from '../components/StatusControls'
import { StatusMark } from '../components/StatusMark'
import { TaskDetail } from '../components/TaskDetail'
import { TriageControl } from '../components/TriageControl'
import { carriedLabel, dateHints, toDayTimeInput, todayIn } from '../dueAt'
import { useShortcutsEnabled } from '../shortcuts/enabled'
import { triageSections } from '../triage'
import { useTimeZone } from '../useMe'
import { BUTTON } from '../components/buttonStyles'
import { useCrumbs } from '../components/Location'

/**
 * TODAY. Panels, each answering one question, in a fixed arrangement.
 *
 *   In progress (the banner)  what am I doing right now -- the page's focal point
 *   Today       (2 of 3)      what am I going to do
 *   Overdue     (right, top)  what am I going to do, urgently
 *   Movement    (right)       where did I get to
 *   Done today  (right)       what did I do
 *
 * The arrangement is fixed by design and there is deliberately no drag, resize or add-panel
 * affordance. The reason is not that it would be hard: one user has one taste, and a rearrangeable
 * grid only hands the design decision back to the person using the tool, every time they open it.
 *
 * A panel grid rather than one capped centre column: at 1440 a single column puts one clump of
 * rows left of centre with half the screen empty beside it. Below `lg` the panels stack into one
 * column, in the same order.
 *
 * The SERVER still decides which segment a task belongs to, in the user's timezone, and the
 * order within it. This page only routes each segment to its panel -- no re-filtering, no
 * re-sorting, and no task in two places (a task can be both overdue and in progress, and
 * rendering it twice reads as "did I create this twice?").
 */
export function Today() {
  useCrumbs([{ label: 'Today' }])
  const today = useQuery({ queryKey: ['today'], queryFn: listToday })
  // Shares the ['completed'] cache entry with the Done page that owns it, so the panel costs
  // one request per session rather than one per visit.
  const completed = useQuery({ queryKey: ['completed'], queryFn: listCompleted })
  const movement = useQuery({ queryKey: ['movement'], queryFn: listMovement })
  const timezone = useTimeZone()
  // Display only: which segment a task is in is decided by the server in the user's timezone.
  const dateLabel = new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: timezone,
  }).format(new Date())
  // The account's own calendar day, for matching the server's `completedOn`. Never a browser-local
  // date: the server already decided which day a task was finished on, and the two must agree.
  // `todayIn` is the ONE place that answers this, for this page, the rows and the panel alike.
  const localToday = todayIn(timezone)
  const clock = new Intl.DateTimeFormat('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: timezone,
  })
  const [openId, setOpenId] = useState<string | null>(null)
  const rows = today.data ?? []
  const openTask = rows.find((t) => t.id === openId)

  const [error, setError] = useState<string | null>(null)
  const singleKeys = useShortcutsEnabled()
  const actions = useTaskActions(setError)
  // The row that just saved from the panel: it says so for a moment, since the panel is gone.
  const [savedId, setSavedId] = useState<string | null>(null)
  useEffect(() => {
    if (!savedId) return
    const timer = setTimeout(() => setSavedId(null), 2000)
    return () => clearTimeout(timer)
  }, [savedId])

  // A change can take its row off this page (finished; stopped with no date; deadline cleared).
  // Whoever had focus on that row would drop to <body>, so the destination is chosen before the
  // change: the next row, else the previous one, else the heading. The order is DOM order across
  // every panel, which is what a reader following the page would expect.
  const focusPlan = useRef<{ self: string; next: string | null } | null>(null)
  const planFocus = (id: string) => {
    const ids = [...document.querySelectorAll<HTMLElement>('[data-today-row]')].map(
      (el) => el.dataset.todayRow!,
    )
    const at = ids.indexOf(id)
    focusPlan.current = { self: id, next: ids[at + 1] ?? ids[at - 1] ?? null }
  }
  const clearPlan = () => void setTimeout(() => (focusPlan.current = null), 0)
  useEffect(() => {
    const plan = focusPlan.current
    if (!plan || document.querySelector(`[data-today-row="${plan.self}"]`)) return
    focusPlan.current = null
    document
      .querySelector<HTMLElement>(plan.next ? `[data-today-row="${plan.next}"]` : '#today-heading')
      ?.focus()
  })
  const setStatus = (id: string, status: TaskStatus) => {
    setError(null)
    planFocus(id)
    actions.setStatus(id, status, clearPlan)
  }
  const patch = (id: string, body: Parameters<typeof actions.patch>[1]) => {
    setError(null)
    planFocus(id)
    actions.patch(id, body, clearPlan)
  }
  // Where focus goes once a triage action has run. The panel and the button inside it unmount, so
  // without this focus would fall to <body> (WCAG 2.4.3). The row is still on screen at this
  // moment; if the change then takes it off the page, `planFocus` above moves focus on again.
  const focusRow = (id: string) =>
    queueMicrotask(() => document.querySelector<HTMLElement>(`[data-today-row="${id}"]`)?.focus())
  const onRowKeyDown = (e: KeyboardEvent, id: string, status: TaskStatus) => {
    // `s` and `x` are single-key shortcuts, so they answer to the same off switch as `/` and `f`.
    const next = singleKeys ? statusForKey(e, status) : null
    if (!next) return
    e.preventDefault()
    setStatus(id, next)
  }
  const todayYmd = localToday

  const closeDetail = () => {
    const id = openId
    setOpenId(null)
    // After the panel unmounts, return focus to the row it was opened from.
    if (id) {
      queueMicrotask(() =>
        (
          document.querySelector<HTMLElement>(`[data-today-row="${id}"]`) ??
          document.querySelector<HTMLElement>('[data-today-row], #today-heading')
        )?.focus(),
      )
    }
  }

  // The panel unmounts without onClose when an edit moves its task off this page; return focus
  // to the page's first row (or the heading, when none is left) rather than losing it to <body> (WCAG 2.4.3).
  useEffect(() => {
    if (openId && today.isSuccess && !openTask) {
      setOpenId(null)
      queueMicrotask(() =>
        document.querySelector<HTMLElement>('[data-today-row], #today-heading')?.focus(),
      )
    }
  }, [openId, openTask, today.isSuccess])

  const breadcrumb = (t: TodayTaskResponse) =>
    t.parentTitle === null ? t.projectName : `${t.projectName} › ${t.parentTitle}`

  /**
   * A row's date cells, worked out ONCE per render. The list's reserved columns and the cells drawn
   * into them must agree, and both of these read the clock ("Was Oct 2, carried" against "Planned
   * for tomorrow"), so computing them twice would let a midnight tick between the two answers.
   */
  type Prepared = {
    t: TodayTaskResponse
    hints: ReturnType<typeof dateHints>
    carried: string | null
    plan: string | null
  }
  const prepare = (list: TodayTaskResponse[]): Prepared[] =>
    list.map((t) => {
      const hints = dateHints(t, timezone)
      const carried = t.segment === 'today' ? carriedLabel(t.scheduledOn, timezone) : null
      // The plan column: a carried plan says so in words; otherwise the planned day, but only when
      // that day is not today -- "Planned for today" under a heading saying Today is noise.
      return {
        t,
        hints,
        carried,
        plan: carried ?? (t.scheduledOn !== todayYmd ? hints.scheduled : null),
      }
    })
  /**
   * Whether ONE PANEL's list reserves the leading icon slot. Per list and never per row: the Today
   * queue and the Overdue panel are two lists in two columns of the page, so each answers for
   * itself, while within either one the icons stay at a single x.
   */
  const leadSlotOf = (list: Prepared[]): boolean =>
    hasLeadSlot(list.map((p) => ({ due: p.t.dueAt !== null, plan: p.plan !== null, notes: false })))

  /**
   * One queue row (RowParts): the project rail at x=0, the status marker, the leading icon slot,
   * then the title with the breadcrumb and the dates under it. There is nothing to the right of the
   * title but the two controls, so the row reads the same in a two-thirds panel and in a
   * one-third one -- which is what let the threshold machinery go.
   */
  const row = ({ t, hints, carried, plan }: Prepared, leadSlot: boolean): ReactNode => {
    const sections = triageSections(t, carried, todayYmd, timezone, patch)
    // One glyph at the row start, the words on the second line. A row whose plan is today's shows
    // no plan text, so it must not claim a plan icon either -- hence `plan`, the wording this row
    // actually renders, rather than `t.scheduledOn`.
    const icon = leadIcon({
      due: hints.due !== null,
      overdue: hints.due?.overdue === true,
      plan: plan !== null,
      notes: false,
    })
    return (
      <li
        key={t.id}
        onClick={(e) => {
          if (!(e.target as HTMLElement).closest('button')) setOpenId(t.id)
        }}
        className={`group relative flex min-h-[46px] cursor-pointer items-start gap-x-2 rounded-lg py-2 pr-2 pl-3 hover:bg-hover ${
          // BLOCKED ROWS DIM AND STAY. This is the page the feature is for: Today stops
          // answering what is due and answers what can be worked on. Hiding them would be the
          // other mistake -- a list that loses tasks cannot be trusted.
          t.blockedBy.length > 0 ? 'opacity-60' : ''
        }`}
      >
        <ProjectRail projectId={t.projectId} />
        <span className="flex h-7 shrink-0 items-center">
          <StatusButton
            status={t.status}
            title={t.title}
            onClick={() => setStatus(t.id, toggleDoneTarget(t.status))}
          />
        </span>
        {/* The icon slot: 1.5rem, reserved for the whole list or not at all, so the glyphs line up
            down the panel. Empty on a row with nothing to say, which is what keeps them aligned. */}
        {leadSlot && (
          <span
            data-lead-slot
            className="flex h-7 w-6 shrink-0 items-center justify-center"
            aria-hidden={icon === null ? true : undefined}
          >
            {icon && <LeadMark icon={icon} />}
          </span>
        )}
        <button
          type="button"
          data-today-row={t.id}
          onClick={() => setOpenId(t.id)}
          onKeyDown={(e) => onRowKeyDown(e, t.id, t.status)}
          className="-m-1 flex min-w-0 flex-1 flex-col rounded-lg p-1 text-left"
        >
          <span className="flex min-w-0 items-baseline">
            <span className={`truncate ${t.status === 'in_progress' ? 'font-semibold' : ''}`}>
              {t.title}
            </span>
            {savedId === t.id && <SavedMark />}
          </span>
          {/* Breadcrumb and dates share ONE line here, in full words: this is the line the user
              reads, and it is not a column, so nothing on it is compressed to line up with the row
              above. The deadline keeps its date and its time to the minute. */}
          <RowMeta
            breadcrumb={breadcrumb(t)}
            due={hints.due}
            plan={plan}
            carried={carried !== null}
            exact={t.dueAt ? toDayTimeInput(t.dueAt, timezone).replace('T', ' ') : undefined}
            summary={t.segment === 'overdue'}
            blocked={blockedLabel(t.blockedBy)}
          />
        </button>
        <span className="flex h-7 shrink-0 items-center justify-end gap-0.5">
          <StartButton
            status={t.status}
            title={t.title}
            onClick={() => setStatus(t.id, toggleStartTarget(t.status))}
            className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100"
          />
          {sections && (
            <TriageControl
              groupLabel={
                t.segment === 'overdue' ? `Overdue: ${t.title}` : `Carried over: ${t.title}`
              }
              triggerLabel={`Change the dates for “${t.title}”`}
              sections={sections}
              onRan={() => focusRow(t.id)}
            />
          )}
        </span>
      </li>
    )
  }

  const inProgress = rows.filter((t) => t.segment === 'in_progress')
  // One thing in progress is THE thing; several are a list. The block's type scale reads off this.
  const alone = inProgress.length === 1
  const queue = prepare(rows.filter((t) => t.segment === 'today'))
  const overdue = prepare(rows.filter((t) => t.segment === 'overdue'))
  const queueLead = leadSlotOf(queue)
  const overdueLead = leadSlotOf(overdue)
  const doneToday = (completed.data?.tasks ?? []).filter((t) => t.completedOn === localToday)
  const movementRows = (movement.data ?? []).filter(hasMovement)
  // The right column renders only what has something to say. An empty column at 1440 would be
  // the very dead space the panel grid exists to remove, so when there is nothing for it the
  // queue takes the whole width instead -- which is what a brand-new account sees.
  const rightColumn = overdue.length > 0 || doneToday.length > 0 || movementRows.length > 0

  return (
    <>
      {today.isPending && <p className="text-ink-muted">Loading…</p>}
      {today.isError && (
        <p role="alert" className="text-danger">
          {today.error instanceof Error
            ? today.error.message
            : "Couldn't load. Check that the server is running."}
        </p>
      )}
      {error && (
        <p role="alert" className="mb-3 text-sm text-danger">
          {error}
        </p>
      )}

      <div
        data-workbench-grid
        // `auto 1fr` rows: the right column spans both, and a grid shares a spanning item's extra
        // height across every row it spans -- so when that column was the taller, part of the
        // difference opened up as a gap under Working on. All of it now goes to the last row.
        className={`grid min-w-0 items-start gap-4 ${rightColumn ? 'lg:grid-cols-[repeat(3,minmax(0,1fr))] lg:grid-rows-[auto_1fr]' : ''}`}
      >
        {/*
          Working on -- the first thing the eye should land on.

          THE SIZE ANSWERS "HOW MANY". One thing in progress is THE thing, and it gets the type
          scale's top step; five are a LIST, and five 24px lines are a wall rather than a focal
          point -- nothing is the focus when everything is. So the title steps down to the row size
          the moment there is more than one, and the breadcrumb with it.

          It also sits in the SAME COLUMN as Today rather than spanning the window: when it was
          full-width, Done and Pause sat a thousand pixels right of the row they act on -- further
          from it than from the edge of the screen.
        */}
        <Panel
          label="Working on"
          className={`${rightColumn ? 'lg:col-span-2 lg:row-start-1' : ''}`}
          heading={<h2 className="text-xs font-semibold text-ink-subtle">Working on</h2>}
        >
          {inProgress.length === 0 ? (
            <PanelEmpty>Nothing in progress</PanelEmpty>
          ) : (
            <ul className="flex flex-col gap-1">
              {inProgress.map((t) => (
                <li
                  key={t.id}
                  onClick={(e) => {
                    if (!(e.target as HTMLElement).closest('button')) setOpenId(t.id)
                  }}
                  className="flex min-w-0 cursor-pointer flex-wrap items-center gap-x-3 gap-y-2 rounded-lg px-2 py-1.5 hover:bg-hover"
                >
                  <StatusMark status={t.status} />
                  <button
                    type="button"
                    data-today-row={t.id}
                    onClick={() => setOpenId(t.id)}
                    onKeyDown={(e) => onRowKeyDown(e, t.id, t.status)}
                    className="-m-1 flex min-w-[12rem] flex-1 flex-col rounded-lg p-1 text-left"
                  >
                    <span className="flex min-w-0 items-baseline">
                      <span
                        data-doing-title
                        className={`truncate font-semibold ${alone ? 'text-2xl' : 'text-base'}`}
                      >
                        {t.title}
                      </span>
                      {savedId === t.id && <SavedMark />}
                    </span>
                    <span className={`truncate text-ink-muted ${alone ? 'text-sm' : 'text-xs'}`}>
                      {breadcrumb(t)}
                    </span>
                  </button>
                  {/* The visible word is contained in the accessible name (WCAG 2.5.3): "Done" in
                      “Complete “Title””. Two controls, no more -- a third “Mark done” beside the mark
                      would give one action two accessible names in one flat namespace. */}
                  <span className="flex shrink-0 items-center gap-2">
                    <button
                      type="button"
                      aria-label={`Complete “${t.title}”`}
                      onClick={() => setStatus(t.id, toggleDoneTarget(t.status))}
                      // 同一条规则：一件事的时候它是那一下，填实的蓝色就是在说「按这里」；五件
                      // 事的时候五个填实的蓝块是一堵墙，谁都不突出，于是谁都不是重点。
                      className={alone ? BUTTON.primary : BUTTON.secondary}
                    >
                      Done
                    </button>
                    <button
                      type="button"
                      aria-label={`Pause “${t.title}”`}
                      onClick={() => setStatus(t.id, toggleStartTarget(t.status))}
                      className={BUTTON.secondary}
                    >
                      Pause
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel
          label="Today"
          className={rightColumn ? 'lg:col-span-2 lg:row-start-2' : ''}
          heading={
            <>
              <h1
                id="today-heading"
                tabIndex={-1}
                className="text-xl font-semibold focus:outline-none"
              >
                Today
              </h1>
              {queue.length > 0 && (
                <span data-count className="text-sm text-ink-subtle tabular-nums">
                  {queue.length}
                </span>
              )}
              <p className="text-sm text-ink-muted">{dateLabel}</p>
            </>
          }
        >
          {/* NO ACTION on this one. An empty Today has no single obvious next step -- whatever the
              reader might do next is already in the rail -- and a button that exists because the
              layout looked bare is the filler that makes an interface read as generated. */}
          {today.isSuccess && rows.length === 0 && <EmptyState title="Nothing for today" />}
          {today.isSuccess && rows.length > 0 && queue.length === 0 && (
            <PanelEmpty>The queue is empty</PanelEmpty>
          )}
          <ul className={ROW_LIST}>{queue.map((p) => row(p, queueLead))}</ul>
        </Panel>

        {rightColumn && (
          <div className="flex min-w-0 flex-col gap-4 lg:col-start-3 lg:row-span-2 lg:row-start-1">
            {/* Overdue renders only when something IS overdue: a panel reading "0" every day is
                noise, and this one has to mean something when it appears. */}
            {overdue.length > 0 && (
              <Panel label="Overdue" count={overdue.length}>
                <ul className={ROW_LIST}>{overdue.map((p) => row(p, overdueLead))}</ul>
              </Panel>
            )}
            {movementRows.length > 0 && (
              <MovementPanel rows={movement.data ?? []} today={localToday} />
            )}
            {doneToday.length > 0 && <DoneTodayPanel tasks={doneToday} clock={clock} />}
          </div>
        )}
      </div>

      {openTask && (
        <TaskDetail
          key={openTask.id}
          task={openTask}
          projectId={openTask.projectId}
          onClose={closeDetail}
          onSaved={() => {
            // Marks the row; the pane stays open in reading mode. The save may have taken the
            // row off this page, and that is fine: what was written is still on screen beside
            // the list it left.
            setSavedId(openTask.id)
          }}
        />
      )}
    </>
  )
}
