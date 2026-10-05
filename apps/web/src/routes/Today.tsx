import { TODAY_SEGMENTS, type TaskStatus, type TodaySegment } from '@ctws/contracts'
import { useQuery } from '@tanstack/react-query'
import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { Link } from 'react-router-dom'
import { toggleDoneTarget, toggleStartTarget, useTaskActions } from '../api/taskActions'
import { listToday } from '../api/today'
import {
  DueCell,
  PlanCell,
  LIST_MEASURE,
  ProjectRail,
  SavedMark,
  ROW_DATE_STACK,
  ROW_GRID,
} from '../components/RowParts'
import { StartButton, StatusButton, statusForKey } from '../components/StatusControls'
import { TaskDetail, toLocalInput } from '../components/TaskDetail'
import { TriageControl, type TriageSection } from '../components/TriageControl'
import { addDays, carriedLabel, dateHints, moveDueToDay, nextMonday, ymd } from '../dueAt'
import { useShortcutsEnabled } from '../shortcuts/enabled'
import { useMe } from '../useMe'

const LABELS: Record<TodaySegment, string> = {
  overdue: '逾期',
  today: '今天',
  in_progress: '正在做',
}

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

  // The server already assigned each task to exactly one segment and ordered rows within it.
  // Grouping here is only partitioning by that field; no re-filtering, no re-sorting.
  const sections = TODAY_SEGMENTS.map((segment) => ({
    segment,
    tasks: rows.filter((t) => t.segment === segment),
  })).filter((s) => s.tasks.length > 0)

  return (
    <>
      {/* The date sits NEXT TO the heading, not pushed to the far right of the column: on a
          wide workbench `justify-between` left it a thousand pixels from the word it dates. */}
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
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
          <ul className={`mt-1 flex flex-col ${LIST_MEASURE}`}>
            {tasks.map((t) => {
              const hints = dateHints(t)
              const carried = segment === 'today' ? carriedLabel(t.scheduledOn) : null
              // The plan column: a carried plan says so in words; otherwise the planned day, but
              // only when that day is not today -- "排到今天" under a heading that already says
              // 今天 is noise, not information.
              const plan = carried ?? (t.scheduledOn !== todayYmd ? hints.scheduled : null)
              // The triage this row needs, if any. The actions are exactly the ones that used to
              // lie on the row as underlined links; what changed is the form, not the request.
              const sections: TriageSection[] | null =
                segment === 'overdue' && t.dueAt
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
                          {
                            label: '今天',
                            run: () => patch(t.id, { dueAt: null, scheduledOn: todayYmd }),
                          },
                          {
                            label: '明天',
                            run: () => patch(t.id, { dueAt: null, scheduledOn: tomorrow }),
                          },
                          {
                            label: '下周',
                            run: () => patch(t.id, { dueAt: null, scheduledOn: nextWeek }),
                          },
                        ],
                      },
                    ]
                  : carried
                    ? [
                        {
                          // The plan-side twin: it moves the PLAN and never touches the deadline.
                          heading: null,
                          actions: [
                            {
                              label: '改到今天',
                              run: () => patch(t.id, { scheduledOn: todayYmd }),
                            },
                            {
                              label: '改到明天',
                              run: () => patch(t.id, { scheduledOn: tomorrow }),
                            },
                            {
                              label: '改到下周',
                              run: () => patch(t.id, { scheduledOn: nextWeek }),
                            },
                            { label: '清除排期', run: () => patch(t.id, { scheduledOn: null }) },
                          ],
                        },
                      ]
                    : null
              return (
                <li
                  key={t.id}
                  onClick={(e) => {
                    if (!(e.target as HTMLElement).closest('button')) setOpenId(t.id)
                  }}
                  // One row system (see RowParts): the project rail at x=0, the status marker, the
                  // title, then the deadline column, the plan column and the action slot -- every
                  // one at a fixed x and reserved whether or not this row fills it.
                  className={`group relative -mx-2 grid cursor-pointer items-start gap-x-2 gap-y-0.5 rounded-md py-1.5 pr-2 pl-3 leading-snug hover:bg-surface-sunken ${ROW_GRID}`}
                >
                  <ProjectRail projectId={t.projectId} />
                  <span className="col-start-1 row-start-1 flex h-6 items-center">
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
                    className="col-start-2 row-start-1 -m-1 flex min-w-0 flex-col rounded-md p-1 text-left"
                  >
                    <span className="flex items-baseline">
                      <span
                        className={`truncate ${t.status === 'in_progress' ? 'font-semibold' : ''}`}
                      >
                        {t.title}
                      </span>
                      {savedId === t.id && <SavedMark />}
                    </span>
                    <span className="truncate text-sm text-fg-muted">
                      {t.parentTitle === null
                        ? t.projectName
                        : `${t.projectName} › ${t.parentTitle}`}
                    </span>
                  </button>
                  {/* Below `sm` the right-hand zone drops to a line of its own -- still two fixed
                      columns, so the alignment survives a phone. `sm:contents` then dissolves this
                      wrapper so the same two columns are grid tracks of the row itself. */}
                  {(hints.due || plan) && (
                    <span className={`col-start-2 row-start-2 gap-x-2 ${ROW_DATE_STACK}`}>
                      <DueCell
                        due={hints.due}
                        exact={t.dueAt ? toLocalInput(t.dueAt).replace('T', ' ') : undefined}
                        className="sm:col-start-3 sm:row-start-1 sm:h-6"
                      />
                      <PlanCell
                        text={plan}
                        carried={carried !== null}
                        className="sm:col-start-4 sm:row-start-1 sm:h-6"
                      />
                    </span>
                  )}
                  <span className="col-start-3 row-start-1 flex h-6 items-center justify-end gap-0.5 sm:col-start-5">
                    <StartButton
                      status={t.status}
                      title={t.title}
                      onClick={() => setStatus(t.id, toggleStartTarget(t.status))}
                      className="h-7 w-7 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100"
                    />
                    {sections && (
                      <TriageControl
                        groupLabel={
                          segment === 'overdue' ? `处理逾期：${t.title}` : `处理顺延：${t.title}`
                        }
                        triggerLabel={`调整「${t.title}」的日期`}
                        sections={sections}
                        onRan={() => focusRow(t.id)}
                      />
                    )}
                  </span>
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
