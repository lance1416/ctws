import { TODAY_SEGMENTS, type TodaySegment } from '@ctws/contracts'
import { useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { listToday } from '../api/today'
import { StatusMark } from '../components/StatusMark'
import { TaskDetail, toLocalInput } from '../components/TaskDetail'
import { overdueLabel } from '../dueAt'
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

  const closeDetail = () => {
    const id = openId
    setOpenId(null)
    // After the panel unmounts, return focus to the row it was opened from.
    if (id) {
      queueMicrotask(() => document.querySelector<HTMLElement>(`[data-today-row="${id}"]`)?.focus())
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
            {tasks.map((t) => (
              <li key={t.id}>
                <button
                  type="button"
                  data-today-row={t.id}
                  onClick={() => setOpenId(t.id)}
                  className="-mx-2 grid w-[calc(100%+1rem)] grid-cols-[16px_1fr_auto] items-start gap-x-3 rounded-md px-2 py-2 text-left leading-snug hover:bg-surface-sunken"
                >
                  <span className="mt-[3px]">
                    <StatusMark status={t.status} />
                  </span>
                  <span className={t.status === 'in_progress' ? 'font-semibold' : ''}>
                    {t.title}
                  </span>
                  {segment === 'overdue' && t.dueAt ? (
                    <span
                      className="text-sm text-overdue"
                      title={toLocalInput(t.dueAt).replace('T', ' ')}
                    >
                      {overdueLabel(t.dueAt)}
                    </span>
                  ) : (
                    <span />
                  )}
                  <span className="col-start-2 col-span-2 text-sm text-fg-muted">
                    {t.parentTitle === null ? t.projectName : `${t.projectName} › ${t.parentTitle}`}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
      {openTask && (
        <TaskDetail
          key={openTask.id}
          task={openTask}
          projectId={openTask.projectId}
          onClose={closeDetail}
        />
      )}
    </>
  )
}
