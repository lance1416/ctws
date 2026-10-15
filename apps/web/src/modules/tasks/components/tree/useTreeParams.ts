import type { TaskResponse } from '@ctws/contracts'
import { useEffect, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useForgetRecent } from '../../../../shell/search/recent'
import { isFinished } from '../../status'
import { ancestorsOf } from '../../tree/ancestors'

/**
 * `?task=<id>` is the open task. `?reveal=<id>` unfolds the task's ancestors, shows it if hidden
 * and focuses it, then is dropped so a later fold is not fought on every render.
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
  const { openId, setOpenId } = useTaskParam()
  const reveal = params.get('reveal')

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

/** The open task, `?task=<id>`, on a project page: the tree's and the board's alike. */
export function useTaskParam() {
  const [params, setParams] = useSearchParams()
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
  return { openId: params.get('task'), setOpenId }
}
