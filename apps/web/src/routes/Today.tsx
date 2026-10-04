import { TODAY_SEGMENTS, type TaskStatus, type TodaySegment } from '@ctws/contracts'
import { useQuery } from '@tanstack/react-query'
import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { Link } from 'react-router-dom'
import { toggleDoneTarget, toggleStartTarget, useTaskActions } from '../api/taskActions'
import { listToday } from '../api/today'
import { StartButton, StatusButton, statusForKey } from '../components/StatusControls'
import { TaskDetail, toLocalInput } from '../components/TaskDetail'
import {
  addDays,
  carriedLabel,
  dateHints,
  moveDueToDay,
  nextMonday,
  overdueLabel,
  ymd,
} from '../dueAt'
import { useShortcutsEnabled } from '../shortcuts/enabled'
import { useMe } from '../useMe'

const LABELS: Record<TodaySegment, string> = {
  overdue: '逾期',
  today: '今天',
  in_progress: '正在做',
}

const exitButton = 'rounded-md py-1 text-fg underline underline-offset-4 hover:text-accent'

export function Today() {
  const today = useQuery({ queryKey: ['today'], queryFn: listToday })
  const me = useMe()
  // Display only: which segment a task is in is decided by the server in the user's timezone.
  const dateLabel = new Intl.DateTimeFormat('zh-CN', {
    month: 'long',
    day: 'numeric',
    weekday: 'short',
    timeZone: me.data?.timezone,
  }).format(new Date())
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
  // change: the next row, else the previous one, else the heading.
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

  // The server already assigned each task to exactly one segment and ordered rows within it.
  // Grouping here is only partitioning by that field; no re-filtering, no re-sorting.
  const sections = TODAY_SEGMENTS.map((segment) => ({
    segment,
    tasks: rows.filter((t) => t.segment === segment),
  })).filter((s) => s.tasks.length > 0)

  return (
    <>
      <div className="flex items-baseline justify-between gap-4">
        <h1 id="today-heading" tabIndex={-1} className="text-2xl font-semibold focus:outline-none">
          今天
        </h1>
        <p className="text-sm text-fg-muted">{dateLabel}</p>
      </div>
      {today.isPending && <p className="mt-6 text-fg-muted">加载中…</p>}
      {today.isError && (
        <p role="alert" className="mt-6 text-danger">
          {today.error instanceof Error ? today.error.message : '加载失败，检查服务是否在运行'}
        </p>
      )}
      {error && (
        <p role="alert" className="mt-4 text-sm text-danger">
          {error}
        </p>
      )}
      {today.isSuccess && sections.length === 0 && (
        <div className="mt-6">
          <p className="text-fg-muted">今天没有安排的事</p>
          <Link to="/projects" className="text-sm text-accent underline underline-offset-4">
            看看全部清单
          </Link>
        </div>
      )}
      {sections.map(({ segment, tasks }) => (
        <section key={segment} aria-label={LABELS[segment]} className="mt-8">
          <h2 className="text-sm font-medium text-fg-muted">
            {LABELS[segment]} <span className="tabular-nums">{tasks.length}</span>
          </h2>
          <ul className="mt-1 flex flex-col">
            {tasks.map((t) => {
              const hints = dateHints(t)
              const carried = segment === 'today' ? carriedLabel(t.scheduledOn) : null
              return (
                <li
                  key={t.id}
                  onClick={(e) => {
                    if (!(e.target as HTMLElement).closest('button')) setOpenId(t.id)
                  }}
                  className="group -mx-2 grid cursor-pointer grid-cols-[24px_1fr_auto] items-start gap-x-2 rounded-md px-2 py-2 leading-snug hover:bg-surface-sunken"
                >
                  <StatusButton
                    status={t.status}
                    title={t.title}
                    onClick={() => setStatus(t.id, toggleDoneTarget(t.status))}
                  />
                  <button
                    type="button"
                    data-today-row={t.id}
                    onClick={() => setOpenId(t.id)}
                    onKeyDown={(e) => onRowKeyDown(e, t.id, t.status)}
                    className="col-start-2 row-span-2 row-start-1 -m-1 flex flex-col rounded-md p-1 text-left"
                  >
                    <span className={t.status === 'in_progress' ? 'font-semibold' : ''}>
                      {t.title}
                    </span>
                    <span className="text-sm text-fg-muted">
                      {t.parentTitle === null
                        ? t.projectName
                        : `${t.projectName} › ${t.parentTitle}`}
                    </span>
                  </button>
                  <span className="col-start-3 row-start-1 flex items-center gap-2">
                    {segment === 'overdue' && t.dueAt ? (
                      <span
                        className="text-sm font-medium text-overdue"
                        title={toLocalInput(t.dueAt).replace('T', ' ')}
                      >
                        {overdueLabel(t.dueAt)}
                      </span>
                    ) : (
                      hints.due && (
                        <span className="text-sm tabular-nums text-fg-muted">{hints.due.text}</span>
                      )
                    )}
                    {savedId === t.id && (
                      <span role="status" className="text-sm text-fg-muted">
                        已保存
                      </span>
                    )}
                    <StartButton
                      status={t.status}
                      title={t.title}
                      onClick={() => setStatus(t.id, toggleStartTarget(t.status))}
                      className="-my-1 opacity-0 group-hover:opacity-100 [@media(hover:none)]:opacity-100"
                    />
                  </span>
                  {segment === 'overdue' && (
                    // The way out of the overdue wall. 推迟 moves the DEADLINE to the chosen day,
                    // keeping its time of day: the person is deliberately moving their own
                    // deadline, so the task legitimately leaves 逾期. The segment cascade is
                    // untouched, so merely scheduling a task still cannot hide a missed deadline;
                    // only changing due_at itself can.
                    <div
                      role="group"
                      aria-label={`处理逾期：${t.title}`}
                      className="col-span-2 col-start-2 mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm"
                    >
                      {hints.scheduled && (
                        <span data-date-hint="scheduled" className="text-fg-muted">
                          {hints.scheduled}
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => patch(t.id, { dueAt: moveDueToDay(t.dueAt!, tomorrow) })}
                        className={exitButton}
                      >
                        推迟到明天
                      </button>
                      <button
                        type="button"
                        onClick={() => patch(t.id, { dueAt: moveDueToDay(t.dueAt!, nextWeek) })}
                        className={exitButton}
                      >
                        推迟到下周
                      </button>
                      <button
                        type="button"
                        onClick={() => patch(t.id, { dueAt: null })}
                        className={exitButton}
                      >
                        取消截止
                      </button>
                      {/* The deadline stops being one: nobody is waiting, so it becomes a plan.
                          Both fields change in one request, so the row cannot be left half-way. */}
                      <span className="flex items-center gap-x-4 text-fg-muted">
                        <span>转为排期：</span>
                        <button
                          type="button"
                          onClick={() => patch(t.id, { dueAt: null, scheduledOn: todayYmd })}
                          className={exitButton}
                        >
                          今天
                        </button>
                        <button
                          type="button"
                          onClick={() => patch(t.id, { dueAt: null, scheduledOn: tomorrow })}
                          className={exitButton}
                        >
                          明天
                        </button>
                        <button
                          type="button"
                          onClick={() => patch(t.id, { dueAt: null, scheduledOn: nextWeek })}
                          className={exitButton}
                        >
                          下周
                        </button>
                      </span>
                    </div>
                  )}
                  {carried && (
                    // The plan-side twin of the group above. It moves the PLAN (scheduled_on) and
                    // never touches the deadline. Marked in words and weight, not red: a carried
                    // plan is not a missed deadline.
                    <div
                      role="group"
                      aria-label={`处理顺延：${t.title}`}
                      className="col-span-2 col-start-2 mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm"
                    >
                      <span data-date-hint="carried" className="font-medium text-fg-muted">
                        {carried}
                      </span>
                      <button
                        type="button"
                        onClick={() => patch(t.id, { scheduledOn: todayYmd })}
                        className={exitButton}
                      >
                        改到今天
                      </button>
                      <button
                        type="button"
                        onClick={() => patch(t.id, { scheduledOn: tomorrow })}
                        className={exitButton}
                      >
                        改到明天
                      </button>
                      <button
                        type="button"
                        onClick={() => patch(t.id, { scheduledOn: nextWeek })}
                        className={exitButton}
                      >
                        改到下周
                      </button>
                      <button
                        type="button"
                        onClick={() => patch(t.id, { scheduledOn: null })}
                        className={exitButton}
                      >
                        清除排期
                      </button>
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        </section>
      ))}
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
