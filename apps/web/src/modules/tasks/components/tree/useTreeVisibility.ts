import { type TaskResponse, type ProjectId, type TaskId } from '@ctws/contracts'
import { useMemo, useState } from 'react'
import { isFinished } from '../../logic/status'
import { loadShownDone, saveShownDone } from '../../logic/tree/collapse'

/** Where a finished row is folded away: under its parent, or at the project's own top level. */
export type DoneGroup = TaskId | 'top'
const groupOf = (t: Pick<TaskResponse, 'parentId'>): DoneGroup => t.parentId ?? 'top'

type Shown = {
  visible: readonly TaskResponse[]
  /** Per group, its closed rows, and how many of them are folded away. */
  closed: Map<DoneGroup, { all: number; hidden: number }>
}

/** The tasks a tree shows, and what each group folds away: see `useTreeVisibility`. */
function visibleTasks(
  tasks: readonly TaskResponse[],
  open: ReadonlySet<DoneGroup>,
  kept: ReadonlySet<string>,
): Shown {
  const index = new Map(tasks.map((t) => [t.id, t]))
  const live = new Set<string>()
  for (const t of tasks) {
    if (isFinished(t.status)) continue
    // Walk up marking ancestors: an unfinished task keeps every parent above it on screen.
    // `live.has` stops the walk, so each chain is climbed once and the whole pass is O(n).
    for (let at = t as TaskResponse | undefined; at && !live.has(at.id);) {
      live.add(at.id)
      at = at.parentId === null ? undefined : index.get(at.parentId)
    }
  }
  // A closed row shows when its group is open and its parent shows, or when it was finished
  // right here. Memoised, and a cycle the server should never send reads as hidden.
  const seen = new Map<string, boolean>()
  const shows = (t: TaskResponse): boolean => {
    const known = seen.get(t.id)
    if (known !== undefined) return known
    seen.set(t.id, false)
    const parent = t.parentId === null ? undefined : index.get(t.parentId)
    const result =
      live.has(t.id) ||
      kept.has(t.id) ||
      (open.has(groupOf(t)) && (parent === undefined || shows(parent)))
    seen.set(t.id, result)
    return result
  }
  const visible = tasks.filter(shows)
  const closed = new Map<DoneGroup, { all: number; hidden: number }>()
  for (const t of tasks) {
    if (live.has(t.id)) continue
    const parent = t.parentId === null ? undefined : index.get(t.parentId)
    // Only where it would show: under a parent that is itself on screen.
    if (parent && !shows(parent)) continue
    const group = groupOf(t)
    const counts = closed.get(group) ?? { all: 0, hidden: 0 }
    counts.all++
    if (!shows(t)) counts.hidden++
    closed.set(group, counts)
  }
  return { visible, closed }
}

/**
 * A finished row folds away under its parent (FR-054), which says "12 done" and opens them on a
 * press, remembered per project; the project's own finished rows fold the same way at the end. A
 * finished parent with unfinished children stays, and so does a row finished right here, for this
 * mount, so a second `x` can undo it.
 */
export function useTreeVisibility(projectId: ProjectId, all: readonly TaskResponse[]) {
  const [open, setOpen] = useState<ReadonlySet<DoneGroup>>(() => loadShownDone(projectId))
  const [kept, setKept] = useState<ReadonlySet<string>>(() => new Set())

  const shown = useMemo(() => visibleTasks(all, open, kept), [all, open, kept])

  const save = (next: ReadonlySet<DoneGroup>) => {
    setOpen(next)
    saveShownDone(projectId, next)
  }
  return {
    visible: shown.visible,
    /** What `visible` would be for these tasks: for a list newer than the last render. */
    visibleOf: (tasks: readonly TaskResponse[]) => visibleTasks(tasks, open, kept).visible,
    closed: shown.closed,
    isOpen: (group: DoneGroup) => open.has(group),
    toggle: (group: DoneGroup) => {
      const next = new Set(open)
      if (!next.delete(group)) next.add(group)
      save(next)
    },
    /** Opens the groups that fold this task or a finished row above it away, so it shows. */
    reveal: (id: TaskId) => {
      const index = new Map(all.map((t) => [t.id, t]))
      const next = new Set(open)
      for (
        let at = index.get(id);
        at;
        at = at.parentId === null ? undefined : index.get(at.parentId)
      )
        if (isFinished(at.status)) next.add(groupOf(at))
      save(next)
    },
    /** Keeps these just-finished rows on screen. */
    keep: (ids: Iterable<string>) => setKept((prev) => new Set([...prev, ...ids])),
  }
}
