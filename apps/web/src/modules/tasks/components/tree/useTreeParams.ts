import { idFrom, taskId, type TaskResponse, type TaskId } from '@ctws/contracts'
import { useEffect, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useForgetRecent } from '../../../../shell/search'
import { isFinished } from '../../logic/status'
import { ancestorsOf } from '../../logic/tree/ancestors'
import type { RowRefs } from '../useRowPane'

/**
 * `?task=<id>` is the open task. `?reveal=<id>` unfolds the task's ancestors, shows it if hidden
 * and focuses it, then is dropped so a later fold is not fought on every render.
 */
export function useTreeParams({
  rows,
  tasks,
  unfold,
  showFinished,
  onRevealed,
}: {
  /** The tree's rows, which the revealed one is focused among. */
  rows: Pick<RowRefs, 'get'>
  tasks: readonly TaskResponse[] | undefined
  unfold: (ids: readonly TaskId[]) => void
  /** Opens what folds this finished task, or a finished row above it, away. */
  showFinished: (id: TaskId) => void
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
    if (isFinished(target.status)) showFinished(reveal)
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
  }, [reveal, tasks, setParams, forget])

  // The row exists only once the unfold has rendered, so focus waits for that render.
  useEffect(() => {
    const id = pending.current
    if (!id) return
    const el = rows.get(id)
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
