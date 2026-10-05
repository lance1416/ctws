import type { CompletedTaskResponse } from '@ctws/contracts'
import { useQuery } from '@tanstack/react-query'
import { useRef } from 'react'
import { Link } from 'react-router-dom'
import { listCompleted } from '../api/completed'
import { useTaskActions } from '../api/taskActions'
import { DONE_LIST_MEASURE, DONE_ROW_GRID, ProjectRail } from '../components/RowParts'
import { StatusButton } from '../components/StatusControls'
import { addDays } from '../dueAt'
import { useMe } from '../useMe'

const WEEKDAY = ['日', '一', '二', '三', '四', '五', '六']

/** "10月2日 周五", with the year when it is not this year; the day is a calendar day, not an instant. */
function dayHeading(day: string, today: string): string {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number]
  const weekday = WEEKDAY[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]
  const date = today.slice(0, 4) === day.slice(0, 4) ? `${m}月${d}日` : `${y}年${m}月${d}日`
  const near = day === today ? '今天 · ' : day === addDays(today, -1) ? '昨天 · ' : ''
  return `${near}${date} 周${weekday}`
}

/**
 * What I finished, newest first, across projects. The server decided the order and which day each
 * task belongs to (in the account timezone); this only partitions the list by that day.
 */
export function Completed() {
  const completed = useQuery({ queryKey: ['completed'], queryFn: listCompleted })
  const me = useMe()
  const timezone = me.data?.timezone
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(new Date())
  const clock = new Intl.DateTimeFormat('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: timezone,
  })
  const heading = useRef<HTMLHeadingElement>(null)
  const actions = useTaskActions(() => {})

  const rows = completed.data ?? []
  const days: { day: string; tasks: CompletedTaskResponse[] }[] = []
  for (const t of rows) {
    const last = days[days.length - 1]
    if (last && last.day === t.completedOn) last.tasks.push(t)
    else days.push({ day: t.completedOn, tasks: [t] })
  }

  return (
    <>
      <h1 ref={heading} tabIndex={-1} className="text-2xl font-semibold focus:outline-none">
        已完成
      </h1>
      {completed.isPending && <p className="mt-6 text-fg-muted">加载中…</p>}
      {completed.isError && (
        <p role="alert" className="mt-6 text-danger">
          {completed.error instanceof Error
            ? completed.error.message
            : '加载失败，检查服务是否在运行'}
        </p>
      )}
      {completed.isSuccess && rows.length === 0 && (
        <div className="mt-6">
          <p className="text-fg-muted">还没有完成的任务</p>
          <Link to="/" className="text-sm text-accent underline underline-offset-4">
            回到今天
          </Link>
        </div>
      )}
      {days.map(({ day, tasks }) => (
        <section key={day} aria-label={dayHeading(day, today)} className="mt-8">
          <h2 className="text-sm font-medium text-fg-muted">
            {dayHeading(day, today)} <span className="tabular-nums">{tasks.length}</span>
          </h2>
          <ul className={`mt-1 flex flex-col ${DONE_LIST_MEASURE}`}>
            {tasks.map((t) => (
              <li
                key={t.id}
                // The same row system as 今天 and the tree: the project rail at x=0, the marker,
                // the title, and one right-hand column. The clock lands at an identical x on
                // every row, which is what makes a day's list scannable rather than readable.
                className={`relative -mx-2 grid items-start gap-x-2 rounded-md py-1.5 pr-2 pl-3 leading-snug ${DONE_ROW_GRID}`}
              >
                <ProjectRail projectId={t.projectId} />
                {/* Restoring is the one way back from a mis-click: a finished task has no other
                    way off this list, and there is deliberately no general undo. */}
                <span className="col-start-1 row-start-1 flex h-6 items-center">
                  <StatusButton
                    status={t.status}
                    title={t.title}
                    onClick={() =>
                      actions.setStatus(t.id, 'backlog', () =>
                        // The row leaves with the refetch; keep focus on the page, not <body>.
                        setTimeout(() => heading.current?.focus(), 0),
                      )
                    }
                  />
                </span>
                <span className="col-start-2 row-start-1 flex min-w-0 flex-col">
                  <span className="truncate">{t.title}</span>
                  <span className="truncate text-sm text-fg-muted">
                    {t.parentTitle === null ? t.projectName : `${t.projectName} › ${t.parentTitle}`}
                  </span>
                </span>
                <time
                  dateTime={t.completedAt ?? undefined}
                  className="col-start-3 row-start-1 flex h-6 items-center text-sm tabular-nums text-fg-muted"
                >
                  {t.completedAt ? clock.format(new Date(t.completedAt)) : ''}
                </time>
              </li>
            ))}
          </ul>
        </section>
      ))}
      {rows.length >= 200 && (
        <p className="mt-8 text-sm text-fg-muted">只显示最近完成的 200 条。</p>
      )}
    </>
  )
}
