import type { CalendarEntry } from '@ctws/contracts'
import { Link } from 'react-router-dom'
import { RowLead } from '../../../../shell/rows/RowLead'
import { ProjectRail } from '../../../../shell/rows/RowParts'
import { RowMeta } from '../../components/TaskRowParts'

type Entry = CalendarEntry & { moduleId: string }

/**
 * Another module's entry on the day's line. The marker's column stays empty so titles line up; a
 * meeting agreed in another zone names that zone beside its title, the margin being your clock.
 */
export function EntryRow({
  entry: e,
  past,
  anyTime,
}: {
  entry: Entry
  past: boolean
  anyTime: boolean
}) {
  return (
    <li data-day-entry={e.moduleId} className="group flex items-stretch">
      <RowLead
        lead={
          e.time
            ? { text: e.time, tone: past ? 'quiet' : 'time', flag: false }
            : anyTime
              ? { text: 'Any time', tone: 'quiet', flag: false }
              : null
        }
      />
      <ProjectRail projectId={e.projectId} />
      <Link
        to={e.to}
        className="flex min-h-11 min-w-0 flex-1 items-start gap-x-2.5 pr-2 pl-3.5 group-hover:bg-hover"
      >
        <span aria-hidden="true" className="h-11 w-7 shrink-0" />
        <span className="flex min-w-0 flex-1 flex-col py-2.5">
          <span className="flex min-w-0 items-baseline gap-2">
            <span data-row-title className={`truncate ${past ? 'text-ink-subtle' : 'text-ink'}`}>
              {e.title}
            </span>
            {e.zone && (
              <span data-entry-zone className="shrink-0 text-sm text-ink-subtle">
                {e.zone}
              </span>
            )}
          </span>
          <RowMeta breadcrumb={e.projectName ?? e.kind} />
        </span>
      </Link>
    </li>
  )
}
