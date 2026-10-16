import { clockTime } from '@ctws/core/clock'
import { LINK } from '../../../platform/ui/buttonStyles'
import type { CompletedTaskResponse } from '@ctws/contracts'
import { Link } from 'react-router-dom'
import { DaySection, ProjectRail, ROW_BODY_WIDE, RowLead } from '../../../shell/rows'
import { StatusMark } from './StatusMark'
import { useTimeZone } from '../../../shell/auth'

/**
 * What I finished today. The rows are not interactive, so a stray click cannot un-finish work;
 * "All" leads to the Done view, where a task can be restored.
 */
export function DoneTodayPanel({
  tasks,
}: {
  /** Already filtered to the server's own "today"; the panel does not decide the day. */
  tasks: CompletedTaskResponse[]
}) {
  const timeZone = useTimeZone()
  return (
    <DaySection
      label="Done today"
      count={tasks.length}
      action={
        <Link to="/tasks/review?view=done" className={`text-sm ${LINK}`}>
          All
        </Link>
      }
    >
      <ul className="flex flex-col">
        {tasks.map((t) => (
          // When it was finished is the margin.
          <li key={t.id} className="flex items-stretch">
            <RowLead
              lead={{
                text: clockTime(new Date(t.completedAt), timeZone),
                tone: 'quiet',
                flag: false,
              }}
              dateTime={t.completedAt}
            />
            <ProjectRail projectId={t.projectId} />
            <span className={`${ROW_BODY_WIDE} min-h-11 items-center gap-2.5 pr-2`}>
              <StatusMark status={t.status} />
              <span className="min-w-0 truncate text-ink-muted">{t.title}</span>
            </span>
          </li>
        ))}
      </ul>
    </DaySection>
  )
}
