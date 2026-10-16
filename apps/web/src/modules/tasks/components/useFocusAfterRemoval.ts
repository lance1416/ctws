import { useEffect, useRef } from 'react'

/**
 * When a row leaves a list, focus goes to the nearest row after it, else before it, else the
 * heading. `expect(id)` before a change that may remove the row, `drop(id)` once it settled with
 * the row still there; the open pane's row is expected until the pane closes.
 */
export function useFocusAfterRemoval({
  ids,
  rowFor,
  heading,
  open,
}: {
  /** The rows' ids in reading order, as rendered. */
  ids: () => readonly string[]
  rowFor: (id: string) => HTMLElement | null
  heading: () => HTMLElement | null
  /** The row whose pane is open, if any. */
  open: string | null
}) {
  const plans = useRef(new Map<string, { order: readonly string[] }>())

  useEffect(() => {
    for (const [self, plan] of plans.current) {
      // While its pane is open, focus is the pane's: the row may be hidden behind it (a task
      // finished from the pane) and the person is still reading.
      if (rowFor(self) || self === open) {
        if (rowFor(self)) plan.order = ids()
        continue
      }
      plans.current.delete(self)
      const at = plan.order.indexOf(self)
      const near = [...plan.order.slice(at + 1), ...plan.order.slice(0, Math.max(at, 0)).reverse()]
      const target = near.map(rowFor).find((el) => el !== null) ?? heading()
      target?.focus()
    }
  })

  const expect = (id: string) => {
    plans.current.set(id, { order: ids() })
  }
  // A tick later, so a list refetched by the change has rendered (and moved focus) first; and
  // only this plan, not one a newer `expect` has made since.
  const drop = (id: string) => {
    const plan = plans.current.get(id)
    setTimeout(() => {
      if (plans.current.get(id) === plan) plans.current.delete(id)
    }, 0)
  }

  useEffect(() => {
    if (!open) return
    expect(open)
    return () => drop(open)
    // `expect` and `drop` only touch the ref: the pane opening and closing is what this is about.
  }, [open])

  return { expect, drop }
}
