import type { TaskId, TaskStatus, TodayTaskResponse } from '@ctws/contracts'
import type { KeyboardEvent } from 'react'
import { useKeyTable } from '../../../../platform/keyboard/keyTable'
import { useRegistry } from '../../../../shell/registry'
import { useRowPane, useRowRefs } from '../../components/useRowPane'
import { useTaskActions } from '../../hooks/useTaskActions'
import { TASKS_ID } from '../../logic/id'
import { statusActions, TODAY_KEYS } from '../../logic/keys'

/** A Today row's change of dates: both in one request, so the row never sits half moved. */
type DatesPatch = { dueAt?: string | null; scheduledOn?: string | null }

/** Other modules' dated things for `day`: one hook per provider, over the registry's fixed list. */
export function useOthersToday(day: string) {
  return useRegistry()
    .calendar.filter((p) => p.moduleId !== TASKS_ID)
    .flatMap((p) =>
      p.useEntries({ from: day, to: day }).entries.map((e) => ({ ...e, moduleId: p.moduleId })),
    )
}

/**
 * What Today's task rows do: change a status or a date, with keys or controls, and move focus on
 * when that, or the open pane, takes a row off the page.
 */
export function useTodayRows({
  rows,
  settled,
  openId,
  setOpenId,
  setError,
}: {
  rows: readonly TodayTaskResponse[]
  settled: boolean
  openId: TaskId | null
  setOpenId: (id: TaskId | null, options?: { replace?: boolean }) => void
  setError: (message: string | null) => void
}) {
  const keys = useKeyTable(TODAY_KEYS)
  const actions = useTaskActions(setError)
  // Focus moves on in reading order.
  const titles = useRowRefs()
  const pane = useRowPane({
    rows: titles,
    tasks: rows,
    settled,
    openId,
    setOpenId,
    heading: () => document.getElementById('today-heading'),
  })
  const { focus } = pane
  const setStatus = (id: TaskId, status: TaskStatus) => {
    setError(null)
    focus.expect(id)
    actions.setStatus(id, status, () => focus.drop(id))
  }
  const patch = (id: TaskId, body: DatesPatch) => {
    setError(null)
    focus.expect(id)
    actions.patch(id, body, () => focus.drop(id))
  }
  return {
    titles,
    pane,
    setStatus,
    patch,
    onRowKeyDown: (e: KeyboardEvent, t: TodayTaskResponse) =>
      keys(
        e,
        statusActions(t.status, (next) => setStatus(t.id, next)),
      ),
  }
}
