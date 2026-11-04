import { refusalText } from '../../../platform/http/retry'
import { useUndo } from '../../../platform/ui/undo'
import {
  type TaskStatus,
  type TaskResponse,
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
 * and without asking. One finished elsewhere asks its change log.
 */
const before = new Map<TaskId, 'todo' | 'in_progress'>()

/** A task's dates as a list holds them, for taking a change of them back. */
type Dates = { scheduledOn?: string | null; dueAt?: string | null }
/** What a row shows of a patch at once: its dates, its stage, its title. */
type Shown = Dates & { stageId?: TaskResponse['stageId']; title?: string }

/**
 * One-click edits from a list row. The row changes at once and the save follows; one that fails
 * puts the row back and says so, with Retry. Finishing a task and changing its dates can be
 * undone; the server still decides the segment a row belongs in, read again after the save.
 */
export function useTaskActions() {
  const qc = useQueryClient()
  const say = useUndo()

  const run = useMutation({
    mutationFn: ({ id, body }: { id: TaskId; body: UpdateTaskBody }) => patchTask(id, body),
    onMutate: async ({ id, body }) => {
      await qc.cancelQueries({ queryKey: taskKeys.lists })
      await qc.cancelQueries({ queryKey: taskKeys.todays })
      const tasks = qc.getQueriesData<ProjectTasks>({ queryKey: taskKeys.lists })
      const today = qc.getQueriesData<TodayTasks>({ queryKey: taskKeys.todays })
      const status = body.status
      const shown: Shown = {}
      if (body.scheduledOn !== undefined) shown.scheduledOn = body.scheduledOn
      if (body.dueAt !== undefined) shown.dueAt = body.dueAt
      if (body.stageId !== undefined) shown.stageId = body.stageId
      if (body.title !== undefined) shown.title = body.title
      if (Object.keys(shown).length > 0) {
        qc.setQueriesData<ProjectTasks>({ queryKey: taskKeys.lists }, (old) =>
          old
            ? { ...old, tasks: old.tasks.map((t) => (t.id === id ? { ...t, ...shown } : t)) }
            : old,
        )
        // Today's rows carry no stage; the title and dates they do.
        const { stageId: _stage, ...onToday } = shown
        qc.setQueriesData<TodayTasks>({ queryKey: taskKeys.todays }, (old) =>
          old?.map((t) => (t.id === id ? { ...t, ...onToday } : t)),
        )
      }
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
    onError: (e, vars, ctx) => {
      for (const [key, data] of [...(ctx?.tasks ?? []), ...(ctx?.today ?? [])]) {
        qc.setQueryData(key, data)
      }
      say.failed(() => run.mutate(vars), refusalText(e))
    },
    scope: ROW_WRITES,
    meta: { changes: ['task'], awaits: [taskKeys.all], ownsError: true },
  })

  /** The task as whichever list holds it has it now. */
  const held = (
    id: TaskId,
  ): { status: TaskStatus; scheduledOn: string | null; dueAt: string | null } | undefined => {
    for (const [, data] of qc.getQueriesData<ProjectTasks>({ queryKey: taskKeys.lists })) {
      const hit = data?.tasks.find((t) => t.id === id)
      if (hit) return hit
    }
    for (const key of [taskKeys.todays, ['tasks', 'ready']] as const)
      for (const [, data] of qc.getQueriesData<
        { id: TaskId; status: TaskStatus; scheduledOn: string | null; dueAt: string | null }[]
      >({ queryKey: key })) {
        const hit = data?.find((t) => t.id === id)
        if (hit) return hit
      }
    return undefined
  }
  const statusOf = (id: TaskId): TaskStatus | undefined => held(id)?.status

  const set = (id: TaskId, status: TaskStatus, after?: () => void) => {
    const was = statusOf(id)
    if (isFinished(status) && was && !isFinished(was)) {
      before.set(id, was === 'in_progress' ? 'in_progress' : 'todo')
    }
    run.mutate({ id, body: { status } }, { onSettled: () => after?.() })
    if (isFinished(status) && was && !isFinished(was))
      say.offer({
        said: status === 'done' ? 'Done' : 'Cancelled',
        undo: () => {
          before.delete(id)
          return run.mutateAsync({ id, body: { status: was } })
        },
      })
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
    patch: (id: TaskId, body: UpdateTaskBody, after?: () => void) => {
      const was = held(id)
      run.mutate({ id, body }, { onSettled: () => after?.() })
      if (!was || (body.scheduledOn === undefined && body.dueAt === undefined)) return
      const back: Dates = {}
      if (body.scheduledOn !== undefined) back.scheduledOn = was.scheduledOn
      if (body.dueAt !== undefined) back.dueAt = was.dueAt
      say.offer({
        said: body.scheduledOn === undefined ? 'Deadline changed' : 'Plan changed',
        undo: () => run.mutateAsync({ id, body: back }),
      })
    },
  }
}
