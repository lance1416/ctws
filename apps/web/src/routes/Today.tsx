import { TODAY_SEGMENTS, type TaskStatus, type TodaySegment } from '@ctws/contracts'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { listToday } from '../api/today'
import { TaskDetail, toLocalInput } from '../components/TaskDetail'

const LABELS: Record<TodaySegment, string> = {
  overdue: '逾期',
  today: '今天',
  in_progress: '正在做',
}

// Full literal class names so Tailwind can see them.
const DOT: Record<TaskStatus, string> = {
  backlog: 'bg-status-backlog',
  todo: 'bg-status-todo',
  in_progress: 'bg-status-in-progress',
  done: 'bg-status-done',
  cancelled: 'bg-status-cancelled',
}

export function Today() {
  const today = useQuery({ queryKey: ['today'], queryFn: listToday })
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

  // The server already assigned each task to exactly one segment and ordered rows within it.
  // Grouping here is only partitioning by that field; no re-filtering, no re-sorting.
  const sections = TODAY_SEGMENTS.map((segment) => ({
    segment,
    tasks: rows.filter((t) => t.segment === segment),
  })).filter((s) => s.tasks.length > 0)

  return (
    <>
      <h1 className="text-2xl font-semibold">今天</h1>
      {today.isPending && <p className="mt-4 text-fg-muted">加载中…</p>}
      {today.isError && (
        <p role="alert" className="mt-4 text-danger">
          {today.error instanceof Error ? today.error.message : '加载失败'}
        </p>
      )}
      {today.isSuccess && sections.length === 0 && (
        <p className="mt-4 text-fg-muted">今天没有安排的事</p>
      )}
      {sections.map(({ segment, tasks }) => (
        <section key={segment} aria-label={LABELS[segment]} className="mt-6">
          <h2 className="text-lg font-medium">{LABELS[segment]}</h2>
          <ul className="mt-2 flex flex-col gap-1">
            {tasks.map((t) => (
              <li key={t.id}>
                <button
                  type="button"
                  data-today-row={t.id}
                  onClick={() => setOpenId(t.id)}
                  className="flex w-full items-center gap-2 rounded px-1 py-1 text-left"
                >
                  <span
                    aria-hidden="true"
                    className={`size-2 shrink-0 rounded-full ${DOT[t.status]}`}
                  />
                  <span className="text-fg">{t.title}</span>
                  <span className="text-fg-muted">
                    {t.parentTitle === null ? t.projectName : `${t.projectName} › ${t.parentTitle}`}
                  </span>
                  {segment === 'overdue' && t.dueAt && (
                    <span className="ml-auto text-overdue">{toLocalInput(t.dueAt)}</span>
                  )}
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
