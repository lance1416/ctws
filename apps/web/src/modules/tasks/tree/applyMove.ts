import type { MoveTaskBody, TaskResponse } from '@ctws/contracts'
import { byRank } from '@ctws/core/rank'

/**
 * The optimistic result of a move: stand-in ranks that hold the dropped order until the refetch
 * brings the server's. They are never sent anywhere.
 */
export function applyMove(old: TaskResponse[], id: string, body: MoveTaskBody): TaskResponse[] {
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
