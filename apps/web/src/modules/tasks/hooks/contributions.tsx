import { useQuery, useQueryClient } from '@tanstack/react-query'
import { refreshQueries } from '../../../platform/http/refresh'
import type { CaptureTargetState, SearchHit } from '../../../shell/contract'
import { inboxOf, useProjects } from '../../../shell/projects'
import { ProjectRail } from '../../../shell/rows'
import { createTask, projectTasksQuery, taskCalendarQuery, taskSearchQuery } from '../api'
import { StatusMark } from '../components/StatusMark'
import { revealHref, taskCrumb } from '../logic/crumb'

/** This module's dated things: a plan day and a deadline day, both decided by the server. */
export function useTaskEntries(range: { from: string; to: string }) {
  const result = useQuery(taskCalendarQuery(range))
  return { entries: result.data ?? [], isError: result.isError }
}

/** Quick capture lands in the workspace inbox, found by its `isInbox` flag, never by name. */
export function useInboxCapture(): CaptureTargetState {
  const qc = useQueryClient()
  const projects = useProjects()
  const inbox = projects.data ? inboxOf(projects.data) : undefined
  return {
    target: inbox
      ? {
          name: inbox.name,
          to: `/projects/${inbox.id}`,
          submit: async (title: string) => {
            await createTask({ projectId: inbox.id, title })
            // Not awaited: the box is free for the next line once the server has this one, and
            // what is typed while the list is read again is that next line.
            void refreshQueries(qc, [projectTasksQuery(inbox.id).queryKey])
          },
        }
      : null,
    missing: projects.isSuccess && !inbox ? 'No inbox to capture into' : null,
    unavailable: projects.isError ? 'Inbox unavailable' : null,
  }
}

/** This module's half of federated search: titles and notes, across every project. */
export function useTaskHits(query: string) {
  const results = useQuery({
    ...taskSearchQuery(query),
    enabled: query.length > 0,
  })
  const rows = results.data ?? []
  const hits: SearchHit[] = rows.map((t) => ({
    id: t.id,
    // `?reveal=` makes `TaskTree` unfold the ancestors and focus the row, which may be folded away.
    to: revealHref(t.projectId, t.id),
    title: t.title,
    meta: (
      <>
        {taskCrumb(t)}
        {t.projectArchived && ' · archived'}
      </>
    ),
    mark: <StatusMark status={t.status} />,
    rail: <ProjectRail projectId={t.projectId} />,
  }))
  return { hits, isError: results.isError, isSuccess: results.isSuccess }
}
