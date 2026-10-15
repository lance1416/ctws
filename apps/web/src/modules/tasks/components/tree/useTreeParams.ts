import type { TaskResponse } from '@ctws/contracts'
import { useEffect, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useForgetRecent } from '../../../../shell/search/recent'
import { isFinished } from '../../status'
import { ancestorsOf } from '../../tree/ancestors'

/**
 * WHAT THE ADDRESS ASKS OF THE TREE.
 *
 * `?task=<id>` is the open task: a task has no page of its own, so its address is its project's
 * page with its sheet open -- a reload reopens it and Back steps out of it.
 *
 * `?reveal=<id>` is an arrival from search: "this task, visible". Every ancestor is unfolded, a
 * hidden finished row is shown, and the row takes focus (and so the tab stop). The parameter is
 * then dropped, in place, so a later fold is not fought on every render.
 */
export function useTreeParams({
  tasks,
  unfold,
  showDone,
  showFinished,
  onRevealed,
}: {
  tasks: readonly TaskResponse[] | undefined
  unfold: (ids: readonly string[]) => void
  showDone: boolean
  showFinished: () => void
  onRevealed: (id: string) => void
}) {
  const [params, setParams] = useSearchParams()
  const openId = params.get('task')
  const reveal = params.get('reveal')
  const setOpenId = (id: string | null, { replace = false }: { replace?: boolean } = {}) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        if (id) next.set('task', id)
        else next.delete('task')
        return next
      },
      { replace },
    )

  const forget = useForgetRecent()
  const pending = useRef<string | null>(null)
  useEffect(() => {
    if (!reveal || !tasks) return
    // Not in this project: a dead link, not a focus target to invent.
    const target = tasks.find((t) => t.id === reveal)
    if (!target) {
      forget('task', reveal)
      return
    }
    if (!showDone && isFinished(target.status)) showFinished()
    unfold(ancestorsOf(tasks, reveal))
    pending.current = reveal
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        next.delete('reveal')
        return next
      },
      { replace: true },
    )
    // Not the handlers, which are new each render: the effect is about the parameter and the data.
  }, [reveal, tasks, showDone, setParams, forget])

  // The row exists only once the unfold has rendered, so focus waits for that render.
  useEffect(() => {
    const id = pending.current
    if (!id) return
    const el = document.querySelector<HTMLElement>(`[data-handle-id="${id}"]`)
    if (!el) return
    pending.current = null
    onRevealed(id)
    el.focus()
    el.scrollIntoView({ block: 'center' })
  })

  return { openId, setOpenId }
}
