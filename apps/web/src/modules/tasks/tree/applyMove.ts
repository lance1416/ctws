import type { MoveTaskBody, TaskResponse } from '@ctws/contracts'

/**
 * The optimistic result of a move. The server computes the real rank, so this only has to put the
 * row where it was dropped until the refetch replaces it: the new parent's children get stand-in
 * ranks in the intended order. They are never sent anywhere.
 */
export function applyMove(old: TaskResponse[], id: string, body: MoveTaskBody): TaskResponse[] {
  const moved = old.find((t) => t.id === id)
  if (!moved) return old
  const siblings = old
    .filter((t) => t.parentId === body.parentId && t.id !== id)
    .sort((a, b) => (a.rank < b.rank ? -1 : a.rank > b.rank ? 1 : a.id < b.id ? -1 : 1))
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
