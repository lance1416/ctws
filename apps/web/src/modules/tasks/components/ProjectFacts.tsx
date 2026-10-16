import { type ProjectListItem, type ProjectId } from '@ctws/contracts'
import { useQuery } from '@tanstack/react-query'
import { Fragment, type ReactNode } from 'react'
import { movementQuery } from '../api/queries'
import { movedLine } from '../movement'
import { openTasksOf } from '../openTasks'
import { shortDay, ymd } from '../../../platform/time/dates'
import { useNow } from '../../../platform/time/useNow'
import { useTimeZone } from '../../../shell/auth'
import { deadlineDayLead, RowLead } from '../../../shell/rows'

/** One project's movement: what is late, what is next, when it last moved. */
function useMoved(projectId: ProjectId) {
  const movement = useQuery(movementQuery())
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
  const today = ymd(useNow(), useTimeZone())

  if (place === 'tile') {
    return (
      <>
        <span className="text-ink-muted tabular-nums">{openTasksOf(p)} open</span>
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
      {openTasksOf(p)} open
    </span>,
  ]
  // "0 overdue" is not news.
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
export function ProjectLead({ projectId }: { projectId: ProjectId }) {
  const m = useMoved(projectId)
  const today = ymd(useNow(), useTimeZone())
  return <RowLead lead={m?.nextDueOn ? deadlineDayLead(m.nextDueOn, today) : null} />
}
