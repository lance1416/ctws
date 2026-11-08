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
/** Today's Ready to start, whatever the day. */
const READY = ['tasks', 'ready'] as const

/**
 * What each task was when this client finished it, for this visit: what it comes back to, at once
 * and without asking. One finished elsewhere asks its change log.
 */
const before = new Map<TaskId, 'todo' | 'in_progress'>()

/** A task's dates as a list holds them, for taking a change of them back. */
type Dates = { scheduledOn?: string | null; dueAt?: string | null }
/** What a row shows of a patch at once: its dates, its stage, its title. */
type Shown = Dates & { stageId?: TaskResponse['stageId']; title?: string }
/** A task as a list holds it: Today's rows carry no stage. */
type Held = {
  status: TaskStatus
  scheduledOn: string | null
  dueAt: string | null
  stageId?: TaskResponse['stageId']
}

/**
 * One-click edits from a list row. The row changes at once and the save follows; one that fails
 * puts the row back and says so, with Retry. A change of status, stage or dates can be undone; the server still decides the segment a row belongs in, read again after the save.
 */
export function useTaskActions() {
  const qc = useQueryClient()
  const say = useUndo()

  const run = useMutation({
    mutationFn: ({ id, body }: { id: TaskId; body: UpdateTaskBody }) => patchTask(id, body),
    onMutate: async ({ id, body }) => {
      await qc.cancelQueries({ queryKey: taskKeys.lists })
      await qc.cancelQueries({ queryKey: taskKeys.todays })
      await qc.cancelQueries({ queryKey: taskKeys.one(id) })
      await qc.cancelQueries({ queryKey: READY })
      const tasks = qc.getQueriesData<ProjectTasks>({ queryKey: taskKeys.lists })
      const today = qc.getQueriesData<TodayTasks>({ queryKey: taskKeys.todays })
      const one = qc.getQueriesData<TaskResponse>({ queryKey: taskKeys.one(id) })
      const ready = qc.getQueriesData<(Held & { id: TaskId })[]>({ queryKey: READY })
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
      // The task's own page, the inspector's, answers at once too.
      qc.setQueryData<TaskResponse>(taskKeys.one(id), (old) =>
        old ? { ...old, ...shown, ...(status ? { status } : {}) } : old,
      )
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
        // Ready to start is work not begun, less what Today lists: one started or finished leaves
        // it at once, or it would show there the moment Today lets it go.
        if (status !== 'todo')
          qc.setQueriesData<(Held & { id: TaskId })[]>({ queryKey: READY }, (old) =>
            old?.filter((t) => t.id !== id),
          )
      }
      return { tasks, today, one, ready }
    },
    onError: (e, vars, ctx) => {
      for (const [key, data] of [
        ...(ctx?.tasks ?? []),
        ...(ctx?.today ?? []),
        ...(ctx?.one ?? []),
        ...(ctx?.ready ?? []),
      ]) {
        qc.setQueryData(key, data)
      }
      say.failed(() => run.mutate(vars), refusalText(e))
    },
    scope: ROW_WRITES,
    meta: { changes: ['task'], awaits: [taskKeys.all], ownsError: true },
  })

  /** The task as whichever list holds it has it now. */
  const held = (id: TaskId): Held | undefined => {
    for (const [, data] of qc.getQueriesData<ProjectTasks>({ queryKey: taskKeys.lists })) {
      const hit = data?.tasks.find((t) => t.id === id)
      if (hit) return hit
    }
    for (const key of [taskKeys.todays, READY] as const)
      for (const [, data] of qc.getQueriesData<(Held & { id: TaskId })[]>({ queryKey: key })) {
        const hit = data?.find((t) => t.id === id)
        if (hit) return hit
      }
    return qc.getQueryData<TaskResponse>(taskKeys.one(id))
  }
  const statusOf = (id: TaskId): TaskStatus | undefined => held(id)?.status

  const set = (id: TaskId, status: TaskStatus, after?: () => void) => {
    const was = statusOf(id)
    const finishing = isFinished(status) && was !== undefined && !isFinished(was)
    if (finishing) before.set(id, was === 'in_progress' ? 'in_progress' : 'todo')
    run.mutate({ id, body: { status } }, { onSettled: () => after?.() })
    if (!was || was === status) return
    say.offer({
      said: finishing ? (status === 'done' ? 'Done' : 'Cancelled') : 'Status changed',
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
      if (!was) return
      const back: Dates & Pick<Shown, 'stageId'> = {}
      if (body.scheduledOn !== undefined) back.scheduledOn = was.scheduledOn
      if (body.dueAt !== undefined) back.dueAt = was.dueAt
      if (body.stageId !== undefined && was.stageId !== undefined && was.stageId !== body.stageId)
        back.stageId = was.stageId
      if (Object.keys(back).length === 0) return
      say.offer({
        said:
          back.stageId !== undefined
            ? 'Stage changed'
            : body.scheduledOn === undefined
              ? 'Deadline changed'
              : 'Plan changed',
        undo: () => run.mutateAsync({ id, body: back }),
      })
    },
  }
}
