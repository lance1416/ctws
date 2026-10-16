import { type TaskStatus, type UpdateTaskBody, type TaskId } from '@ctws/contracts'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { isFinished } from '../status'
import { PROJECT_TASKS, todayQuery } from './queries'
import { patchTask, type ProjectTasks } from './tasks'

const TODAY = todayQuery().queryKey

/**
 * Finish the task, or bring a finished one back. It comes back to `backlog`, not its earlier
 * status, which only the event log knows.
 */
export const toggleDoneTarget = (s: TaskStatus): TaskStatus => (isFinished(s) ? 'backlog' : 'done')

/** Start, or stop. Stopping lands on `todo`, even if the task came from `backlog`. */
export const toggleStartTarget = (s: TaskStatus): TaskStatus =>
  s === 'in_progress' ? 'todo' : 'in_progress'

/**
 * One-click edits from a list row. Status changes are optimistic; date changes wait for the
 * server, which decides the segment a row belongs in.
 */
export function useTaskActions(onError: (message: string) => void) {
  const qc = useQueryClient()

  const run = useMutation({
    mutationFn: ({ id, body }: { id: TaskId; body: UpdateTaskBody }) => patchTask(id, body),
    onMutate: async ({ id, body }) => {
      await qc.cancelQueries({ queryKey: PROJECT_TASKS })
      await qc.cancelQueries({ queryKey: TODAY })
      const tasks = qc.getQueriesData<ProjectTasks>({ queryKey: PROJECT_TASKS })
      const today = qc.getQueryData(TODAY)
      const status = body.status
      if (status) {
        // The row answers at once; the rollups wait for the refetch.
        qc.setQueriesData<ProjectTasks>({ queryKey: PROJECT_TASKS }, (old) =>
          old ? { ...old, tasks: old.tasks.map((t) => (t.id === id ? { ...t, status } : t)) } : old,
        )
        qc.setQueryData(TODAY, (old) =>
          old
            ?.map((t) => (t.id === id ? { ...t, status } : t))
            // The list never holds finished work, so a finished row leaves at once.
            .filter((t) => !isFinished(t.status)),
        )
      }
      return { tasks, today }
    },
    onError: (e, _vars, ctx) => {
      ctx?.tasks.forEach(([key, data]) => qc.setQueryData(key, data))
      qc.setQueryData(TODAY, ctx?.today)
      onError(e instanceof Error ? e.message : "Couldn't save the change")
    },
    meta: { awaits: [['tasks']] },
  })

  return {
    setStatus: (id: TaskId, status: TaskStatus, after?: () => void) =>
      run.mutate({ id, body: { status } }, { onSettled: () => after?.() }),
    patch: (id: TaskId, body: UpdateTaskBody, after?: () => void) =>
      run.mutate({ id, body }, { onSettled: () => after?.() }),
  }
}
