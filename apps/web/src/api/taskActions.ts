import type { TaskResponse, TaskStatus, TodayTaskResponse, UpdateTaskBody } from '@ctws/contracts'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { patchTask } from './tasks'

/**
 * What the status mark does when clicked (or `x` on a focused row): finish the task, or, if it is
 * already finished or cancelled, bring it back.
 *
 * DELIBERATE SIMPLIFICATION: bringing a task back lands on `backlog`, not on whatever it was
 * before it was finished. Restoring the previous status needs a read of the task's event log
 * (or a stored prior status), which is a larger change than this loop needs; the user is one
 * click from `todo` or `in_progress` anyway. Revisit if "un-complete" turns out to be a frequent,
 * precise action.
 */
export const toggleDoneTarget = (s: TaskStatus): TaskStatus =>
  s === 'done' || s === 'cancelled' ? 'backlog' : 'done'

/**
 * The cheap route to "正在做": start, or stop. Stopping lands on `todo` (it is still something to
 * do), again a simplification: it does not remember a `backlog` it may have come from.
 */
export const toggleStartTarget = (s: TaskStatus): TaskStatus =>
  s === 'in_progress' ? 'todo' : 'in_progress'

/**
 * Mutations for the one-click edits made from a list row, without opening the detail panel.
 * Status changes are optimistic (the mark must answer the click now); date changes wait for the
 * server, since which segment a row belongs in is the server's decision. Both end by refetching
 * everything that could have been touched, and a failed request rolls the optimistic edit back.
 */
export function useTaskActions(onError: (message: string) => void) {
  const qc = useQueryClient()

  const run = useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateTaskBody }) => patchTask(id, body),
    onMutate: async ({ id, body }) => {
      await qc.cancelQueries({ queryKey: ['tasks'] })
      await qc.cancelQueries({ queryKey: ['today'] })
      const tasks = qc.getQueriesData<TaskResponse[]>({ queryKey: ['tasks'] })
      const today = qc.getQueryData<TodayTaskResponse[]>(['today'])
      const status = body.status
      if (status) {
        qc.setQueriesData<TaskResponse[]>({ queryKey: ['tasks'] }, (old) =>
          old?.map((t) => (t.id === id ? { ...t, status } : t)),
        )
        qc.setQueryData<TodayTaskResponse[]>(['today'], (old) =>
          old
            ?.map((t) => (t.id === id ? { ...t, status } : t))
            // The list never holds finished work, so a finished row leaves at once.
            .filter((t) => t.status !== 'done' && t.status !== 'cancelled'),
        )
      }
      return { tasks, today }
    },
    onError: (e, _vars, ctx) => {
      ctx?.tasks.forEach(([key, data]) => qc.setQueryData(key, data))
      qc.setQueryData(['today'], ctx?.today)
      onError(e instanceof Error ? e.message : '修改失败')
    },
    onSettled: async () => {
      await qc.invalidateQueries({ queryKey: ['today'] })
      await qc.invalidateQueries({ queryKey: ['tasks'] })
    },
  })

  return {
    setStatus: (id: string, status: TaskStatus, after?: () => void) =>
      run.mutate({ id, body: { status } }, { onSettled: () => after?.() }),
    patch: (id: string, body: UpdateTaskBody, after?: () => void) =>
      run.mutate({ id, body }, { onSettled: () => after?.() }),
  }
}
