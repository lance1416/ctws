import { type TaskPosition, type TaskResponse, type TaskId } from '@ctws/contracts'
import { byRank } from '@ctws/core/rank'

/**
 * The optimistic result of a move: stand-in ranks that hold the dropped order until the refetch
 * brings the server's. They are never sent anywhere.
 */
export function applyMove(old: TaskResponse[], id: TaskId, body: TaskPosition): TaskResponse[] {
  const moved = old.find((t) => t.id === id)
  if (!moved) return old
  const siblings = old.filter((t) => t.parentId === body.parentId && t.id !== id).sort(byRank)
  let at = siblings.length
  if (body.beforeId)
    at = Math.max(
      siblings.findIndex((t) => t.id === body.beforeId),
      0,
    )
  else if (body.afterId) at = siblings.findIndex((t) => t.id === body.afterId) + 1
  const ordered = [...siblings.slice(0, at), moved, ...siblings.slice(at)]
  const rankOf = new Map(ordered.map((t, i) => [t.id, String(i).padStart(8, '0')]))
  return old.map((t) =>
    t.id === id
      ? { ...t, parentId: body.parentId, rank: rankOf.get(id)! }
      : rankOf.has(t.id)
        ? { ...t, rank: rankOf.get(t.id)! }
        : t,
  )
}

/**
 * Where a task stands now, as a move would name it: under its parent, before the sibling after
 * it, or after the one before it when it is last. A move to here puts it back.
 */
export function placeOf(
  tasks: readonly TaskResponse[],
  id: TaskId,
  projectId: TaskPosition['projectId'],
): TaskPosition | null {
  const task = tasks.find((t) => t.id === id)
  if (!task) return null
  const siblings = tasks.filter((t) => t.parentId === task.parentId).sort(byRank)
  const at = siblings.findIndex((t) => t.id === id)
  const place: TaskPosition = { projectId, parentId: task.parentId }
  const next = siblings[at + 1]
  const previous = siblings[at - 1]
  if (next) place.beforeId = next.id
  else if (previous) place.afterId = previous.id
  return place
}
