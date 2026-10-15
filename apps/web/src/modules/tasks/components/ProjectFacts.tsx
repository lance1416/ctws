import type { ProjectListItem } from '@ctws/contracts'
import { useQuery } from '@tanstack/react-query'
import { Fragment, type ReactNode } from 'react'
import { listMovement } from '../api/movement'
import { movedLine } from '../movement'
import { shortDay, todayIn } from '../../../platform/time/dates'
import { useNow } from '../../../platform/time/useNow'
import { useTimeZone } from '../../../shell/auth/useMe'
import { deadlineDayLead } from '../../../shell/rows/leads'
import { RowLead } from '../../../shell/rows/RowLead'

/** One project's movement: what is late, what is next, when it last moved. Archived ones have none. */
function useMoved(projectId: string) {
  const movement = useQuery({ queryKey: ['movement'], queryFn: listMovement })
  return movement.data?.find((m) => m.projectId === projectId)
}

/**
 * A project's tasks in numbers: a sentence on its row in the list, three lines on its Workbench
 * card. The open count is the server's, never counted here.
 */
export function ProjectFacts({
  project: p,
  place,
}: {
  project: ProjectListItem
  place: 'row' | 'tile'
}) {
  const m = useMoved(p.id)
  const today = todayIn(useTimeZone(), useNow())

  if (place === 'tile') {
    return (
      <>
        <span className="text-ink-muted tabular-nums">{p.openTasks} open</span>
        {m && m.overdue > 0 ? (
          <span className="text-missed">{m.overdue} overdue</span>
        ) : m?.nextDueOn ? (
          <span className="text-deadline">Due {shortDay(m.nextDueOn, today)}</span>
        ) : null}
        {m && <span className="text-ink-subtle">{movedLine(m, today)}</span>}
      </>
    )
  }

  const said: ReactNode[] = [
    <span key="open" data-count>
      {p.openTasks} open
    </span>,
  ]
  // "0 overdue" is not news; the one number allowed the miss colour, when there is one.
  if (m && m.overdue > 0)
    said.push(
      <span key="late" className="text-missed">
        {m.overdue} overdue
      </span>,
    )
  if (m) said.push(<span key="moved">{movedLine(m, today)}</span>)
  return said.map((part, i) => (
    <Fragment key={i}>
      {i > 0 && <span aria-hidden="true"> · </span>}
      {part}
    </Fragment>
  ))
}

/** The project's next standing deadline, in the margin of its row. */
export function ProjectLead({ projectId }: { projectId: string }) {
  const m = useMoved(projectId)
  const today = todayIn(useTimeZone(), useNow())
  return <RowLead lead={m?.nextDueOn ? deadlineDayLead(m.nextDueOn, today) : null} />
}
