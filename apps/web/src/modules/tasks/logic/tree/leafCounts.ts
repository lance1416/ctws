import type { ChildCounts, TaskId, TaskResponse } from '@ctws/contracts'

type Node = Pick<TaskResponse, 'id' | 'parentId' | 'status'>

/**
 * Each parent's leaves, at any depth (FR-051): how many are done, how many count (neither in the
 * backlog nor cancelled), and how many wait in the backlog. The measure a parent's square and its
 * "1/4" share. Only parents are in the map; a leaf has its own status instead.
 */
export function leafCounts(tasks: readonly Node[]): Map<TaskId, ChildCounts> {
  const children = new Map<TaskId, Node[]>()
  for (const t of tasks) {
    if (t.parentId === null) continue
    const list = children.get(t.parentId)
    if (list) list.push(t)
    else children.set(t.parentId, [t])
  }
  const out = new Map<TaskId, ChildCounts>()
  // Memoised per node, so a deep tree is walked once; `walking` breaks a cycle the server should
  // never send.
  const walking = new Set<TaskId>()
  const of = (t: Node): ChildCounts => {
    const kids = children.get(t.id)
    if (!kids || walking.has(t.id))
      return {
        done: t.status === 'done' ? 1 : 0,
        counted: t.status === 'backlog' || t.status === 'cancelled' ? 0 : 1,
        backlog: t.status === 'backlog' ? 1 : 0,
      }
    const known = out.get(t.id)
    if (known) return known
    walking.add(t.id)
    const sum = { done: 0, counted: 0, backlog: 0 }
    for (const k of kids) {
      const c = of(k)
      sum.done += c.done
      sum.counted += c.counted
      sum.backlog += c.backlog
    }
    walking.delete(t.id)
    out.set(t.id, sum)
    return sum
  }
  for (const t of tasks) of(t)
  return out
}
