import { LINK } from './buttonStyles'
import type { CompletedTaskResponse } from '@ctws/contracts'
import { Link } from 'react-router-dom'
import { ProjectRail } from './RowParts'
import { RowLead } from './RowLead'
import { StatusMark } from './StatusMark'
import { DaySection } from './DaySection'

/**
 * DONE TODAY: the fourth question the workbench answers -- "what did I do".
 *
 * It reads the SAME ['completed'] list the Done page owns, and takes the day the SERVER
 * assigned (`completedOn`, computed in the account's timezone). It does not re-derive "today"
 * from the browser clock: a task finished at 23:30 local must not fall off this panel because
 * the database runs in UTC, and that decision already exists one layer down.
 *
 * The rows are not interactive here. Restoring a task is a Done-page action and a mis-aimed
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
    <DaySection
      label="Done today"
      count={tasks.length}
      action={
        <Link to="/tasks/completed" className={`text-sm ${LINK}`}>
          All
        </Link>
      }
    >
      <ul className="flex flex-col">
        {tasks.map((t) => (
          // The anatomy (RowParts): when it was finished is the margin.
          <li key={t.id} className="flex items-stretch">
            <RowLead
              lead={
                t.completedAt
                  ? { text: clock.format(new Date(t.completedAt)), tone: 'quiet', flag: false }
                  : null
              }
              dateTime={t.completedAt ?? undefined}
            />
            <ProjectRail projectId={t.projectId} />
            <span className="flex min-h-11 min-w-0 flex-1 items-center gap-2.5 pr-2 pl-3.5">
              <StatusMark status={t.status} />
              <span className="min-w-0 truncate text-ink-muted">{t.title}</span>
            </span>
          </li>
        ))}
      </ul>
    </DaySection>
  )
}
