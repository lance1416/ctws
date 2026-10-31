import type { TaskId } from '@ctws/contracts'
import { useEffect, useRef } from 'react'

/**
 * The rows a list draws, by id: each row's focus carrier registers through `ref(id)`, so the list
 * focuses a row without searching the page for an attribute that a rename would quietly break.
 * One task can be drawn twice (in progress and due today); its first in reading order counts.
 */
export function useRowRefs() {
  const drawn = useRef(new Map<TaskId, Set<HTMLElement>>())
  const refs = useRef(new Map<TaskId, (el: HTMLElement | null) => () => void>())
  const inOrder = () =>
    [...drawn.current]
      .flatMap(([id, els]) => [...els].map((el) => ({ id, el })))
      .sort((a, b) =>
        a.el.compareDocumentPosition(b.el) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1,
      )
  const get = (id: TaskId) => inOrder().find((row) => row.id === id)?.el ?? null
  return {
    /** The ref of `id`'s focus carrier; the same function every render. */
    ref: (id: TaskId) => {
      let ref = refs.current.get(id)
      if (!ref) {
        ref = (el) => {
          if (el) drawn.current.set(id, (drawn.current.get(id) ?? new Set()).add(el))
          return () => {
            if (el) drawn.current.get(id)?.delete(el)
            if (drawn.current.get(id)?.size === 0) drawn.current.delete(id)
          }
        }
        refs.current.set(id, ref)
      }
      return ref
    },
    get,
    /** The drawn rows' ids in reading order. */
    ids: () => inOrder().map((row) => row.id),
    first: () => inOrder()[0]?.el ?? null,
  }
}

export type RowRefs = ReturnType<typeof useRowRefs>

/**
 * When a row leaves a list, focus goes to the nearest row before it, where the eye already was,
 * else after it, else the heading (BUG-094). `expect(id)` before a change that may remove the row, `drop(id)` once it settled with
 * the row still there; the open pane's row is expected until the pane closes.
 */
function useFocusAfterRemoval({
  rows,
  heading,
  open,
}: {
  rows: RowRefs
  heading: () => HTMLElement | null
  /** The row whose pane is open, if any. */
  open: TaskId | null
}) {
  const plans = useRef(new Map<TaskId, { order: readonly TaskId[] }>())

  useEffect(() => {
    for (const [self, plan] of plans.current) {
      // While its pane is open, focus is the pane's: the row may be hidden behind it (a task
      // finished from the pane) and the person is still reading.
      if (rows.get(self) || self === open) {
        if (rows.get(self)) plan.order = rows.ids()
        continue
      }
      plans.current.delete(self)
      const at = plan.order.indexOf(self)
      const near = [...plan.order.slice(0, Math.max(at, 0)).reverse(), ...plan.order.slice(at + 1)]
      const target = near.map(rows.get).find((el) => el !== null) ?? heading()
      target?.focus()
    }
  })

  const expect = (id: TaskId) => {
    plans.current.set(id, { order: rows.ids() })
  }
  // A tick later, so a list refetched by the change has rendered (and moved focus) first; and
  // only this plan, not one a newer `expect` has made since.
  const drop = (id: TaskId) => {
    const plan = plans.current.get(id)
    setTimeout(() => {
      if (plans.current.get(id) === plan) plans.current.delete(id)
    }, 0)
  }

  useEffect(() => {
    if (!open) return
    expect(open)
    return () => drop(open)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- expect and drop only touch the ref; this is about the pane opening.
  }, [open])

  return { expect, drop }
}

/**
 * A list of tasks and the pane one of them is open in. The pane's task is looked up in the list on
 * each render, so one that has left it (deleted, moved, finished off the page) closes its pane;
 * nobody took that step, so the open id is put right in place. Closed, focus goes back to the row
 * it was opened from; when the pane takes its task away, to a neighbouring row.
 */
export function useRowPane<T extends { id: TaskId }>({
  rows,
  tasks,
  settled,
  openId,
  setOpenId,
  heading,
}: {
  /** The list's rows, from `useRowRefs`. */
  rows: RowRefs
  tasks: readonly T[]
  /** The list has loaded, so a task missing from it is gone rather than not read yet. */
  settled: boolean
  openId: TaskId | null
  setOpenId: (id: TaskId | null, options?: { replace?: boolean }) => void
  /** Where focus goes when no row is left. */
  heading: () => HTMLElement | null
}) {
  const focus = useFocusAfterRemoval({ rows, heading, open: openId })
  const openTask = tasks.find((t) => t.id === openId)
  useEffect(() => {
    if (openId && settled && !openTask) setOpenId(null, { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- setOpenId may be new each render; this reacts to the data.
  }, [openId, openTask, settled])
  return {
    focus,
    openTask,
    /** Back to the row it was opened from, once the pane is gone; else the first, else the heading. */
    close: () => {
      const id = openId
      setOpenId(null)
      if (id) queueMicrotask(() => (rows.get(id) ?? rows.first() ?? heading())?.focus())
    },
  }
}
