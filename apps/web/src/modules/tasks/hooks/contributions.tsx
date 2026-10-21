import { keepPreviousData, useQuery } from '@tanstack/react-query'
import type { CaptureTargetState, SearchHit } from '../../../shell/contract'
import { useRefresh } from '../../../shell/registry'
import { inboxOf, useProjects } from '../../../shell/projects'
import { createTask, taskCalendarQuery, taskKeys, taskSearchQuery } from '../api'
import { StatusMark } from '../components/StatusMark'
import { revealHref, taskCrumb } from '../logic/crumb'

/** This module's dated things: a plan day and a deadline day, both decided by the server. */
export function useTaskEntries(range: { from: string; to: string }) {
  // The month stepped away from stays drawn until the next one is in.
  const result = useQuery({ ...taskCalendarQuery(range), placeholderData: keepPreviousData })
  return { entries: result.data ?? [], isError: result.isError }
}

/** Quick capture lands in the workspace inbox, found by its `isInbox` flag, never by name. */
export function useInboxCapture(): CaptureTargetState {
  const refresh = useRefresh()
  const projects = useProjects()
  const inbox = projects.data ? inboxOf(projects.data) : undefined
  return {
    target: inbox
      ? {
          name: inbox.name,
          to: `/projects/${inbox.id}`,
          submit: async (title: string, { projectId, date }) => {
            const into = projectId ?? inbox.id
            await createTask({ projectId: into, title, ...(date ? { scheduledOn: date } : {}) })
            // Not awaited: the box is free for the next line once the server has this one, and
            // what is typed while the list is read again is that next line.
            void refresh(['task'], [taskKeys.list(into)])
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
    type: 'task',
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
  }))
  return { hits, isError: results.isError, isSuccess: results.isSuccess }
}
