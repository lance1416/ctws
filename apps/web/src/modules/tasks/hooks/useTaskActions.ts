import { problemText } from '../../../platform/http/api'
import {
  type TaskStatus,
  type TodayTaskResponse,
  type UpdateTaskBody,
  type TaskId,
} from '@ctws/contracts'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { isFinished, REOPEN, reopenedTo, type StatusMove } from '../logic/status'
import { patchTask, type ProjectTasks, ROW_WRITES, taskChanges, taskKeys } from '../api'

type TodayTasks = TodayTaskResponse[]

/**
 * What each task was when this client finished it, for this visit: what it comes back to, at once
 * and without asking (BUG-095). One finished elsewhere asks its change log.
 */
const before = new Map<TaskId, 'todo' | 'in_progress'>()

/**
 * One-click edits from a list row. Status changes are optimistic; date changes wait for the
 * server, which decides the segment a row belongs in.
 */
export function useTaskActions(onError: (message: string) => void) {
  const qc = useQueryClient()

  const run = useMutation({
    mutationFn: ({ id, body }: { id: TaskId; body: UpdateTaskBody }) => patchTask(id, body),
    onMutate: async ({ id, body }) => {
      await qc.cancelQueries({ queryKey: taskKeys.lists })
      await qc.cancelQueries({ queryKey: taskKeys.todays })
      const tasks = qc.getQueriesData<ProjectTasks>({ queryKey: taskKeys.lists })
      const today = qc.getQueriesData<TodayTasks>({ queryKey: taskKeys.todays })
      const status = body.status
      if (status) {
        // The row answers at once; the rollups wait for the refetch.
        qc.setQueriesData<ProjectTasks>({ queryKey: taskKeys.lists }, (old) =>
          old ? { ...old, tasks: old.tasks.map((t) => (t.id === id ? { ...t, status } : t)) } : old,
        )
        qc.setQueriesData<TodayTasks>({ queryKey: taskKeys.todays }, (old) =>
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
    meta: { changes: ['task'], awaits: [taskKeys.all], ownsError: true },
  })

  /** The status the row has now, from whichever list holds it. */
  const statusOf = (id: TaskId): TaskStatus | undefined => {
    for (const [, data] of qc.getQueriesData<ProjectTasks>({ queryKey: taskKeys.lists })) {
      const hit = data?.tasks.find((t) => t.id === id)
      if (hit) return hit.status
    }
    for (const key of [taskKeys.todays, ['tasks', 'ready']] as const)
      for (const [, data] of qc.getQueriesData<{ id: TaskId; status: TaskStatus }[]>({
        queryKey: key,
      })) {
        const hit = data?.find((t) => t.id === id)
        if (hit) return hit.status
      }
    return undefined
  }

  const set = (id: TaskId, status: TaskStatus, after?: () => void) => {
    if (isFinished(status)) {
      const was = statusOf(id)
      if (was && !isFinished(was)) before.set(id, was === 'in_progress' ? 'in_progress' : 'todo')
    }
    run.mutate({ id, body: { status } }, { onSettled: () => after?.() })
  }

  return {
    /** A status, or `REOPEN`: back to what it was before it was finished, to do if unknown. */
    setStatus: (id: TaskId, move: StatusMove, after?: () => void) => {
      if (move !== REOPEN) return set(id, move, after)
      const known = before.get(id)
      before.delete(id)
      if (known) return set(id, known, after)
      void taskChanges(id)
        .catch(() => [])
        .then((changes) => set(id, reopenedTo(changes), after))
    },
    patch: (id: TaskId, body: UpdateTaskBody, after?: () => void) =>
      run.mutate({ id, body }, { onSettled: () => after?.() }),
  }
}
