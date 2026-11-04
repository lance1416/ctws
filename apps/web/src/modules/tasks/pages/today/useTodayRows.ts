import type { TaskId, TodayTaskResponse } from '@ctws/contracts'
import { isFinished, REOPEN, type StatusMove } from '../../logic/status'
import { useState, type KeyboardEvent } from 'react'
import { useKeyTable } from '../../../../platform/keyboard/keyTable'
import { useRegistry } from '../../../../shell/registry'
import { useRowPane, useRowRefs } from '../../components/useRowPane'
import { useTaskActions } from '../../hooks/useTaskActions'
import { TASKS_ID } from '../../logic/id'
import { statusActions, TODAY_KEYS } from '../../logic/keys'

/** How long a row finished here stays, ticked and struck, before it leaves its list. */
const STAYS_MS = 1500

/** A Today row's change of dates: both in one request, so the row never sits half moved. */
type DatesPatch = { dueAt?: string | null; scheduledOn?: string | null }

/**
 * Other modules' dated things for `day`: one hook per provider, over the registry's fixed list.
 * `failed` when any of them could not be read, and `retry` reads those again.
 */
export function useOthersToday(day: string) {
  const sources = useRegistry()
    .calendar.filter((p) => p.moduleId !== TASKS_ID)
    .map((p) => ({ moduleId: p.moduleId, ...p.useEntries({ from: day, to: day }) }))
  return {
    entries: sources.flatMap((s) => s.entries.map((e) => ({ ...e, moduleId: s.moduleId }))),
    failed: sources.some((s) => s.isError),
    retry: () => {
      for (const s of sources) if (s.isError) s.retry()
    },
  }
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
}: {
  rows: readonly TodayTaskResponse[]
  settled: boolean
  openId: TaskId | null
  setOpenId: (id: TaskId | null, options?: { replace?: boolean }) => void
}) {
  const keys = useKeyTable(TODAY_KEYS)
  const actions = useTaskActions()
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
  // Rows finished here, as they were, with where they stood: the list reads again without them
  // at once, and they stay a moment longer so the change is seen and can be undone.
  const [staying, setStaying] = useState<
    ReadonlyMap<TaskId, { row: TodayTaskResponse; at: number }>
  >(new Map())
  const stay = (row: TodayTaskResponse, status: TodayTaskResponse['status']) => {
    const at = rows.indexOf(row)
    setStaying((was) => new Map(was).set(row.id, { row: { ...row, status }, at }))
    setTimeout(
      () =>
        setStaying((was) => {
          const next = new Map(was)
          next.delete(row.id)
          return next
        }),
      STAYS_MS,
    )
  }
  const setStatus = (id: TaskId, status: StatusMove) => {
    const row = rows.find((r) => r.id === id)
    if (row && status !== REOPEN && isFinished(status) && !isFinished(row.status)) stay(row, status)
    focus.expect(id)
    actions.setStatus(id, status, () => focus.drop(id))
  }
  const patch = (id: TaskId, body: DatesPatch) => {
    focus.expect(id)
    actions.patch(id, body, () => focus.drop(id))
  }
  return {
    titles,
    pane,
    setStatus,
    patch,
    /** The rows to draw: the list's, and those finished here a moment ago, where they stood. */
    shown: (list: readonly TodayTaskResponse[]): TodayTaskResponse[] => {
      const out = list.filter((r) => !staying.has(r.id))
      for (const { row, at } of [...staying.values()].sort((a, b) => a.at - b.at))
        out.splice(Math.min(Math.max(at, 0), out.length), 0, row)
      return out
    },
    // A parent's status is its children's: its row takes no status keys.
    onRowKeyDown: (e: KeyboardEvent, t: TodayTaskResponse) =>
      keys(e, t.children ? {} : statusActions(t.status, (next) => setStatus(t.id, next))),
  }
}
