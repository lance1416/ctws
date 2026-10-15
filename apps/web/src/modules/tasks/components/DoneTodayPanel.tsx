import { LINK } from '../../../platform/ui/buttonStyles'
import type { CompletedTaskResponse } from '@ctws/contracts'
import { Link } from 'react-router-dom'
import { ProjectRail } from '../../../shell/rows/RowParts'
import { RowLead } from '../../../shell/rows/RowLead'
import { StatusMark } from './StatusMark'
import { DaySection } from '../../../shell/rows/DaySection'

/**
 * What I finished today. The rows are not interactive, so a stray click cannot un-finish work;
 * "All" leads to the Done view, where a task can be restored.
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
