import type { StageResponse, TaskId, TaskResponse } from '@ctws/contracts'
import { ymd } from '../../../../platform/time/dates'
import { isFinished } from '../status'
import { ancestorsOf } from '../tree/ancestors'
import { flatten } from '../tree/flatten'

/** In a stage this long, it is time to chase (FR-058); a project may set its own one day. */
export const STALE_DAYS = 14

/** A node on the board by stage, with what its card says beyond its name. */
export type StageCard = {
  task: TaskResponse
  /** Its ancestors from the top down: the line above the card when there are any ("Amazon"). */
  path: TaskResponse[]
  /** The next leaf under it still to do: the one under way, else the first waiting to start. */
  next: TaskResponse | null
  /** Whole days since it reached this stage, on the account's calendar; null when unknown. */
  days: number | null
  /** The day it is due, on the account's calendar, while it is open. */
  dueDay: string | null
}

export type StageColumn = { stage: StageResponse; cards: StageCard[] }

const DAY_MS = 86_400_000
const daysBetween = (from: string, to: string) =>
  Math.round((Date.parse(to) - Date.parse(from)) / DAY_MS)

/**
 * THE BOARD BY STAGE (FR-058, artboard 20): a column per stage in the project's order, each the
 * whole list of the nodes at that stage, at any depth. Those with a date come first, the nearest
 * first; the rest by how long they have waited at the stage, longest first. `today` is given;
 * nothing here reads the clock.
 */
export function stageColumns(
  tasks: readonly TaskResponse[],
  stages: readonly StageResponse[],
  { today, timeZone }: { today: string; timeZone: string },
): StageColumn[] {
  const byId = new Map(tasks.map((t) => [t.id, t]))
  const kids = new Map<TaskId, TaskResponse[]>()
  for (const t of tasks) {
    if (t.parentId === null) continue
    kids.set(t.parentId, [...(kids.get(t.parentId) ?? []), t])
  }
  const order = new Map(flatten(tasks, new Set()).map((row, i) => [row.id, i]))
  const at = (t: TaskResponse) => order.get(t.id) ?? Number.MAX_SAFE_INTEGER

  const leavesUnder = (id: TaskId): TaskResponse[] =>
    (kids.get(id) ?? []).flatMap((c) => (kids.has(c.id) ? leavesUnder(c.id) : [c]))
  const nextUnder = (id: TaskId): TaskResponse | null => {
    const open = leavesUnder(id)
      .filter((t) => t.status === 'in_progress' || t.status === 'todo')
      .sort((a, b) => at(a) - at(b))
    return open.find((t) => t.status === 'in_progress') ?? open[0] ?? null
  }

  const cardOf = (task: TaskResponse): StageCard => ({
    task,
    path: ancestorsOf(tasks, task.id)
      .reverse()
      .map((id) => byId.get(id))
      .filter((t): t is TaskResponse => t !== undefined),
    next: kids.has(task.id) ? nextUnder(task.id) : null,
    days: task.stageSince ? daysBetween(ymd(new Date(task.stageSince), timeZone), today) : null,
    dueDay: task.dueAt && !isFinished(task.status) ? ymd(new Date(task.dueAt), timeZone) : null,
  })

  return stages.map((stage) => ({
    stage,
    cards: tasks
      .filter((t) => t.stageId === stage.id)
      .map(cardOf)
      .sort((a, b) => {
        if (a.dueDay !== b.dueDay) {
          if (a.dueDay === null) return 1
          if (b.dueDay === null) return -1
          return a.dueDay < b.dueDay ? -1 : 1
        }
        return (b.days ?? -1) - (a.days ?? -1) || at(a.task) - at(b.task)
      }),
  }))
}
