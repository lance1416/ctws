import { problemText } from '../../../platform/http/api'
import {
  type TaskStatus,
  type TodayTaskResponse,
  type UpdateTaskBody,
  type TaskId,
} from '@ctws/contracts'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { isFinished } from '../logic/status'
import { patchTask, PROJECT_TASKS, type ProjectTasks, ROW_WRITES, TODAY_TASKS } from '../api'

type TodayTasks = TodayTaskResponse[]

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
      await qc.cancelQueries({ queryKey: TODAY_TASKS })
      const tasks = qc.getQueriesData<ProjectTasks>({ queryKey: PROJECT_TASKS })
      const today = qc.getQueriesData<TodayTasks>({ queryKey: TODAY_TASKS })
      const status = body.status
      if (status) {
        // The row answers at once; the rollups wait for the refetch.
        qc.setQueriesData<ProjectTasks>({ queryKey: PROJECT_TASKS }, (old) =>
          old ? { ...old, tasks: old.tasks.map((t) => (t.id === id ? { ...t, status } : t)) } : old,
        )
        qc.setQueriesData<TodayTasks>({ queryKey: TODAY_TASKS }, (old) =>
          old
            ?.map((t) => (t.id === id ? { ...t, status } : t))
            // The list never holds finished work, so a finished row leaves at once.
            .filter((t) => !isFinished(t.status)),
        )
      }
      return { tasks, today }
    },
    onError: (e, _vars, ctx) => {
      for (const [key, data] of [...(ctx?.tasks ?? []), ...(ctx?.today ?? [])]) {
        qc.setQueryData(key, data)
      }
      onError(problemText(e) ?? "Couldn't save the change")
    },
    scope: ROW_WRITES,
    meta: { awaits: [['tasks']], ownsError: true },
  })

  return {
    setStatus: (id: TaskId, status: TaskStatus, after?: () => void) =>
      run.mutate({ id, body: { status } }, { onSettled: () => after?.() }),
    patch: (id: TaskId, body: UpdateTaskBody, after?: () => void) =>
      run.mutate({ id, body }, { onSettled: () => after?.() }),
  }
}
