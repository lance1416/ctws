import type { TaskStatus, TodayTaskResponse } from '@ctws/contracts'
import { useQuery } from '@tanstack/react-query'
import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { listCompleted } from '../api/completed'
import { toggleDoneTarget, toggleStartTarget, useTaskActions } from '../api/taskActions'
import { listToday } from '../api/today'
import { listMovement } from '../api/movement'
import { DoneTodayPanel } from '../components/DoneTodayPanel'
import { MovementPanel } from '../components/MovementPanel'
import { hasMovement } from '../movement'
import { Panel, PanelEmpty } from '../components/Panel'
import {
  DueCell,
  PlanCell,
  ProjectRail,
  SavedMark,
  ROW_DATE_STACK,
  ROW_GRID,
  ROW_LIST,
} from '../components/RowParts'
import { EMPTY_ACTION, EmptyState } from '../components/EmptyState'
import { StartButton, StatusButton, statusForKey } from '../components/StatusControls'
import { StatusMark } from '../components/StatusMark'
import { TaskDetail, toLocalInput } from '../components/TaskDetail'
import { TriageControl, type TriageSection } from '../components/TriageControl'
import { addDays, carriedLabel, dateHints, moveDueToDay, nextMonday, ymd } from '../dueAt'
import { useShortcutsEnabled } from '../shortcuts/enabled'
import { useMe } from '../useMe'

/**
 * THE WORKBENCH. Four panels, each answering one question, in a fixed arrangement.
 *
 *   正在做 (the banner)   what am I doing right now -- the page's focal point
 *   今天   (2 of 3)       what am I going to do
 *   逾期   (right, top)   what am I going to do, urgently
 *   做到哪儿了 (right)     where did I get to
 *   今天完成的 (right)     what did I do
 *
 * The arrangement is fixed by design (workbench spec §1) and there is deliberately no drag,
 * resize or add-panel affordance. The reason is not that it would be hard: one user has one
 * taste, and a rearrangeable grid only hands the design decision back to the person using the
 * tool, every time they open it.
 *
 * The panel grid replaces a single capped centre column. At 1440 that column put one clump of
 * rows left of centre with half the screen empty beside it; the width now carries content
 * instead. Below `lg` the panels stack into one column, in the same order.
 *
 * The SERVER still decides which segment a task belongs to, in the user's timezone, and the
 * order within it. This page only routes each segment to its panel -- no re-filtering, no
 * re-sorting, and no task in two places (a task can be both overdue and in progress, and
 * rendering it twice reads as "did I create this twice?").
 */
export function Today() {
  const today = useQuery({ queryKey: ['today'], queryFn: listToday })
  // Shares the ['completed'] cache entry with the 已完成 page that owns it, so the panel costs
  // one request per session rather than one per visit.
  const completed = useQuery({ queryKey: ['completed'], queryFn: listCompleted })
  const movement = useQuery({ queryKey: ['movement'], queryFn: listMovement })
  const me = useMe()
  const timezone = me.data?.timezone
  // Display only: which segment a task is in is decided by the server in the user's timezone.
  const dateLabel = new Intl.DateTimeFormat('zh-CN', {
    month: 'long',
    day: 'numeric',
    weekday: 'short',
    timeZone: timezone,
  }).format(new Date())
  // The account's own calendar day, for matching the server's `completedOn`. Never a browser-local
  // date: the server already decided which day a task was finished on, and the two must agree.
  const localToday = new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(new Date())
  const clock = new Intl.DateTimeFormat('zh-CN', {
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
  const todayYmd = ymd(new Date())
  const tomorrow = addDays(todayYmd, 1)
  const nextWeek = nextMonday(todayYmd)

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

  /** The triage a row needs, if any: the overdue actions, or the carried-plan ones. */
  const triageFor = (t: TodayTaskResponse, carried: string | null): TriageSection[] | null =>
    t.segment === 'overdue' && t.dueAt
      ? [
          {
            heading: '推迟截止',
            actions: [
              {
                label: '推迟到明天',
                run: () => patch(t.id, { dueAt: moveDueToDay(t.dueAt!, tomorrow) }),
              },
              {
                label: '推迟到下周',
                run: () => patch(t.id, { dueAt: moveDueToDay(t.dueAt!, nextWeek) }),
              },
              { label: '取消截止', run: () => patch(t.id, { dueAt: null }) },
            ],
          },
          {
            // The deadline stops being one: nobody is waiting, so it becomes a plan.
            // Both fields change in ONE request, so the row cannot be left half-way.
            heading: '转为排期',
            actions: [
              { label: '今天', run: () => patch(t.id, { dueAt: null, scheduledOn: todayYmd }) },
              { label: '明天', run: () => patch(t.id, { dueAt: null, scheduledOn: tomorrow }) },
              { label: '下周', run: () => patch(t.id, { dueAt: null, scheduledOn: nextWeek }) },
            ],
          },
        ]
      : carried
        ? [
            {
              // The plan-side twin: it moves the PLAN and never touches the deadline.
              heading: null,
              actions: [
                { label: '改到今天', run: () => patch(t.id, { scheduledOn: todayYmd }) },
                { label: '改到明天', run: () => patch(t.id, { scheduledOn: tomorrow }) },
                { label: '改到下周', run: () => patch(t.id, { scheduledOn: nextWeek }) },
                { label: '清除排期', run: () => patch(t.id, { scheduledOn: null }) },
              ],
            },
          ]
        : null

  /**
   * One queue row. The row system is unchanged (RowParts): the project rail at x=0, the status
   * marker, the title, then the deadline column, the plan column and the action slot -- every one
   * at a fixed x and reserved whether or not this row fills it. What is new is that the columns
   * answer to the LIST's width rather than the viewport's, because the same row now renders in a
   * two-thirds panel and in a one-third one on the same screen.
   */
  const row = (t: TodayTaskResponse): ReactNode => {
    const hints = dateHints(t)
    const carried = t.segment === 'today' ? carriedLabel(t.scheduledOn) : null
    // The plan column: a carried plan says so in words; otherwise the planned day, but only when
    // that day is not today -- "排到今天" under a heading that already says 今天 is noise.
    const plan = carried ?? (t.scheduledOn !== todayYmd ? hints.scheduled : null)
    const sections = triageFor(t, carried)
    return (
      <li
        key={t.id}
        onClick={(e) => {
          if (!(e.target as HTMLElement).closest('button')) setOpenId(t.id)
        }}
        className={`group relative grid min-h-[46px] cursor-pointer items-start gap-x-2 gap-y-0.5 rounded-lg py-2 pr-2 pl-3 leading-snug hover:bg-surface-hover ${ROW_GRID}`}
      >
        <ProjectRail projectId={t.projectId} />
        <span className="col-start-1 row-start-1 flex h-7 items-center">
          <StatusButton
            status={t.status}
            title={t.title}
            onClick={() => setStatus(t.id, toggleDoneTarget(t.status))}
          />
        </span>
        <button
          type="button"
          data-today-row={t.id}
          onClick={() => setOpenId(t.id)}
          onKeyDown={(e) => onRowKeyDown(e, t.id, t.status)}
          className="col-start-2 row-start-1 -m-1 flex min-w-0 flex-col rounded-lg p-1 text-left"
        >
          <span className="flex items-baseline">
            <span className={`truncate ${t.status === 'in_progress' ? 'font-semibold' : ''}`}>
              {t.title}
            </span>
            {savedId === t.id && <SavedMark />}
          </span>
          <span className="truncate text-sm text-fg-muted">{breadcrumb(t)}</span>
        </button>
        {/* On a narrow list the right-hand zone drops to a line of its own -- still two columns,
            so the alignment survives a phone and a one-third panel alike. `@xl:contents` then
            dissolves this wrapper so the same two columns are grid tracks of the row itself.
            That second line spans the WHOLE row rather than starting under the title: inside a
            one-third panel the title track is about 190px, and sharing it between a deadline
            ("今天 23:30 截止") and a carried plan ("原定10月2日，已顺延") clipped both of them --
            and those words, not the colour, are what the cells are for. */}
        {(hints.due || plan) && (
          <span className={`col-start-1 col-span-3 row-start-2 gap-x-2 ${ROW_DATE_STACK}`}>
            <DueCell
              due={hints.due}
              exact={t.dueAt ? toLocalInput(t.dueAt).replace('T', ' ') : undefined}
              className="@xl:col-start-3 @xl:row-start-1 @xl:h-7"
            />
            <PlanCell
              text={plan}
              carried={carried !== null}
              exact={carried ?? undefined}
              className="@xl:col-start-4 @xl:row-start-1 @xl:h-7"
            />
          </span>
        )}
        <span className="col-start-3 row-start-1 flex h-7 items-center justify-end gap-0.5 @xl:col-start-5">
          <StartButton
            status={t.status}
            title={t.title}
            onClick={() => setStatus(t.id, toggleStartTarget(t.status))}
            className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100"
          />
          {sections && (
            <TriageControl
              groupLabel={t.segment === 'overdue' ? `处理逾期：${t.title}` : `处理顺延：${t.title}`}
              triggerLabel={`调整「${t.title}」的日期`}
              sections={sections}
              onRan={() => focusRow(t.id)}
            />
          )}
        </span>
      </li>
    )
  }

  const inProgress = rows.filter((t) => t.segment === 'in_progress')
  const queue = rows.filter((t) => t.segment === 'today')
  const overdue = rows.filter((t) => t.segment === 'overdue')
  const doneToday = (completed.data ?? []).filter((t) => t.completedOn === localToday)
  const movementRows = (movement.data ?? []).filter(hasMovement)
  // The right column renders only what has something to say. An empty column at 1440 would be
  // the very dead space the panel grid exists to remove, so when there is nothing for it the
  // queue takes the whole width instead -- which is what a brand-new account sees.
  const rightColumn = overdue.length > 0 || doneToday.length > 0 || movementRows.length > 0

  return (
    <>
      {today.isPending && <p className="text-fg-muted">加载中…</p>}
      {today.isError && (
        <p role="alert" className="text-danger">
          {today.error instanceof Error ? today.error.message : '加载失败，检查服务是否在运行'}
        </p>
      )}
      {error && (
        <p role="alert" className="mb-3 text-sm text-danger">
          {error}
        </p>
      )}

      {/* 正在做 -- the first thing the eye should land on (workbench spec §1). It is the only
          block carrying the accent across its full height, and the ONLY place the type scale's
          top step (34px) is spent: on the thing being done right now. The page's own heading is
          one step below it, because a 34px 今天 beside a 23px task title made the page title the
          focal point and the work the footnote -- exactly backwards. */}
      <Panel
        label="正在做"
        className="border-l-4 border-l-accent"
        heading={<h2 className="text-xs font-medium text-fg-subtle">正在做</h2>}
      >
        {inProgress.length === 0 ? (
          <PanelEmpty>现在没有在做的事。从下面的队列里挑一件，按 s 开始。</PanelEmpty>
        ) : (
          <ul className="flex flex-col gap-1">
            {inProgress.map((t) => (
              <li
                key={t.id}
                onClick={(e) => {
                  if (!(e.target as HTMLElement).closest('button')) setOpenId(t.id)
                }}
                className="flex min-w-0 cursor-pointer flex-wrap items-center gap-x-3 gap-y-2 rounded-lg px-2 py-1.5 hover:bg-surface-hover"
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
                    <span className="truncate text-2xl font-semibold">{t.title}</span>
                    {savedId === t.id && <SavedMark />}
                  </span>
                  <span className="truncate text-sm text-fg-muted">{breadcrumb(t)}</span>
                </button>
                {/* The visible word is contained in the accessible name (WCAG 2.5.3): "完成" in
                    「完成「标题」」. Two controls, no more -- a third "标记完成" beside the mark
                    would give one action two accessible names in one flat namespace. */}
                <span className="flex shrink-0 items-center gap-2">
                  <button
                    type="button"
                    aria-label={`完成「${t.title}」`}
                    onClick={() => setStatus(t.id, toggleDoneTarget(t.status))}
                    className="h-9 rounded-lg bg-accent px-3.5 text-sm font-medium text-accent-fg hover:opacity-90"
                  >
                    完成
                  </button>
                  <button
                    type="button"
                    aria-label={`暂停「${t.title}」`}
                    onClick={() => setStatus(t.id, toggleStartTarget(t.status))}
                    className="h-9 rounded-lg border border-border-strong px-3.5 text-sm text-fg hover:bg-surface-hover"
                  >
                    暂停
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <div
        data-workbench-grid
        className={`mt-4 grid min-w-0 items-start gap-4 ${rightColumn ? 'lg:grid-cols-[repeat(3,minmax(0,1fr))]' : ''}`}
      >
        <Panel
          label="今天"
          className={rightColumn ? 'lg:col-span-2' : ''}
          heading={
            <>
              <h1
                id="today-heading"
                tabIndex={-1}
                className="text-xl font-semibold focus:outline-none"
              >
                今天
              </h1>
              {queue.length > 0 && (
                <span data-count className="text-sm text-fg-subtle tabular-nums">
                  {queue.length}
                </span>
              )}
              <p className="text-sm text-fg-muted">{dateLabel}</p>
            </>
          }
        >
          {today.isSuccess && rows.length === 0 && (
            <EmptyState
              title="今天没有要做的事"
              hint="排到今天的、已经逾期的、正在做的，都会落到这一页。"
              action={
                <Link to="/projects" className={EMPTY_ACTION}>
                  去挑一件来做
                </Link>
              }
            />
          )}
          {today.isSuccess && rows.length > 0 && queue.length === 0 && (
            <PanelEmpty>队列是空的。</PanelEmpty>
          )}
          <ul className={ROW_LIST}>{queue.map(row)}</ul>
        </Panel>

        {rightColumn && (
          <div className="flex min-w-0 flex-col gap-4">
            {/* 逾期 renders only when something IS overdue: a panel reading "0" every day is
                noise, and this one has to mean something when it appears. */}
            {overdue.length > 0 && (
              <Panel label="逾期" count={overdue.length}>
                <ul className={ROW_LIST}>{overdue.map(row)}</ul>
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
            setSavedId(openTask.id)
            // The save may have taken the row off this page: same rule as a status change.
            planFocus(openTask.id)
            setTimeout(() => (focusPlan.current = null), 1000)
            closeDetail()
          }}
        />
      )}
    </>
  )
}
