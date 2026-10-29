import { keepPreviousData, useQuery } from '@tanstack/react-query'
import type { CaptureTargetState } from '../../../shell/contract'
import { useRefresh } from '../../../shell/registry'
import { inboxOf, useProjects } from '../../../shell/projects'
import { createTask, taskCalendarQuery, taskKeys } from '../api'
import { openHref } from '../logic/crumb'

/** This module's dated things: a plan day and a deadline day, both decided by the server. */
export function useTaskEntries(range: { from: string; to: string }) {
  // The month stepped away from stays drawn until the next one is in.
  const result = useQuery({ ...taskCalendarQuery(range), placeholderData: keepPreviousData })
  return {
    entries: result.data ?? [],
    isError: result.isError,
    retry: () => void result.refetch(),
  }
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
          submit: async (title: string, { projectId, date, parentId }) => {
            const into = projectId ?? inbox.id
            const made = await createTask({
              projectId: into,
              title,
              ...(parentId ? { parentId } : {}),
              ...(date ? { scheduledOn: date } : {}),
            })
            // Not awaited: the box is free for the next line once the server has this one, and
            // what is typed while the list is read again is that next line.
            void refresh(['task'], [taskKeys.list(into)])
            // No page of its own: its project's, with it in the inspector.
            return openHref(into, made.id)
          },
        }
      : null,
    missing: projects.isSuccess && !inbox ? 'No inbox to capture into' : null,
    unavailable: projects.isError ? 'Inbox unavailable' : null,
  }
}
