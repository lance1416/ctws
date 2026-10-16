import { idFrom, taskId, type TaskResponse, type TaskId } from '@ctws/contracts'
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
  unfold: (ids: readonly TaskId[]) => void
  showDone: boolean
  showFinished: () => void
  onRevealed: (id: TaskId) => void
}) {
  const [params, setParams] = useSearchParams()
  const { openId, setOpenId } = useTaskParam()
  const revealParam = params.get('reveal')
  const reveal = revealParam === null ? null : idFrom(taskId, revealParam)

  const forget = useForgetRecent()
  const pending = useRef<TaskId | null>(null)
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- not the handlers, new each render: this is about the parameter and data.
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
  const setOpenId = (id: TaskId | null, { replace = false }: { replace?: boolean } = {}) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        if (id) next.set('task', id)
        else next.delete('task')
        return next
      },
      { replace },
    )
  const task = params.get('task')
  return { openId: task === null ? null : idFrom(taskId, task), setOpenId }
}
