import type { CompletedTaskResponse } from '@ctws/contracts'
import { Link } from 'react-router-dom'
import { DONE_ROW_GRID, ProjectRail } from './RowParts'
import { StatusMark } from './StatusMark'
import { Panel } from './Panel'

/**
 * 今天完成的: the fourth question the workbench answers -- "what did I do".
 *
 * It reads the SAME ['completed'] list the 已完成 page owns, and takes the day the SERVER
 * assigned (`completedOn`, computed in the account's timezone). It does not re-derive "today"
 * from the browser clock: a task finished at 23:30 local must not fall off this panel because
 * the database runs in UTC, and that decision already exists one layer down.
 *
 * The rows are not interactive here. Restoring a task is a 已完成-page action and a mis-aimed
 * click on a glance panel should not un-finish work; the panel's footer link is the way through.
 */
export function DoneTodayPanel({
  tasks,
  clock,
}: {
  /** Already filtered to the server's own "today"; the panel does not decide the day. */
  tasks: CompletedTaskResponse[]
  clock: Intl.DateTimeFormat
}) {
  return (
    <Panel
      label="今天完成的"
      count={tasks.length}
      action={
        <Link to="/tasks/completed" className="text-sm text-accent hover:underline">
          全部
        </Link>
      }
    >
      <ul className="flex flex-col">
        {tasks.map((t) => (
          <li
            key={t.id}
            className={`relative grid min-h-11 items-center gap-x-2 rounded-lg px-2 py-1.5 pl-3 ${DONE_ROW_GRID}`}
          >
            <ProjectRail projectId={t.projectId} at="left-0" />
            <span className="col-start-1 flex items-center justify-center">
              <StatusMark status={t.status} />
            </span>
            <span className="col-start-2 min-w-0 truncate text-fg-muted">{t.title}</span>
            <time
              dateTime={t.completedAt ?? undefined}
              className="col-start-3 text-sm text-fg-subtle tabular-nums"
            >
              {t.completedAt ? clock.format(new Date(t.completedAt)) : ''}
            </time>
          </li>
        ))}
      </ul>
    </Panel>
  )
}
