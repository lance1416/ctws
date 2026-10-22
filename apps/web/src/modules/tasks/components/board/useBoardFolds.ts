import type { ProjectId, TaskId, TaskStatus } from '@ctws/contracts'
import { useRef, useState } from 'react'
import { openGroups, type BoardColumn } from '../../logic/board/boardColumns'
import { loadBoardFolds, saveBoardFolds } from '../../logic/board/folds'

const key = (status: TaskStatus, root: TaskId | null) => `${status}:${root ?? 'own'}`

/**
 * Which groups each column has open and which show all their cards. A group starts as
 * `openGroups` found it when it first appeared, so a card moving in or out never folds its
 * neighbours; one folded or opened by hand stays so, remembered per project (DES-001 section 4).
 * "N more" lasts until the board is left.
 */
export function useBoardFolds(projectId: ProjectId, columns: ReadonlyMap<TaskStatus, BoardColumn>) {
  const first = useRef(new Map<string, boolean>())
  for (const column of columns.values()) {
    if (column.groups.every((g) => first.current.has(key(column.status, g.root.id)))) continue
    const open = openGroups(column)
    for (const g of column.groups) {
      const k = key(column.status, g.root.id)
      if (!first.current.has(k)) first.current.set(k, open.has(g.root.id))
    }
  }
  const [chosen, setChosenNow] = useState<ReadonlyMap<string, boolean>>(() =>
    loadBoardFolds(projectId),
  )
  const setChosen = (change: (now: ReadonlyMap<string, boolean>) => Map<string, boolean>) => {
    const next = change(chosen)
    setChosenNow(next)
    saveBoardFolds(projectId, next)
  }
  const [all, setAll] = useState<ReadonlySet<string>>(new Set())

  const isOpen = (status: TaskStatus, root: TaskId) =>
    chosen.get(key(status, root)) ?? first.current.get(key(status, root)) ?? true
  const showAll = (status: TaskStatus, root: TaskId | null) =>
    setAll((now) => new Set(now).add(key(status, root)))
  return {
    isOpen,
    isAll: (status: TaskStatus, root: TaskId | null) => all.has(key(status, root)),
    toggle: (status: TaskStatus, root: TaskId) =>
      setChosen((now) => new Map(now).set(key(status, root), !isOpen(status, root))),
    showAll,
    /** Opens the run a card has just moved into, and all of it if it lands past the fifth. */
    reveal: (status: TaskStatus, root: TaskId | null, pastLimit: boolean) => {
      if (root) setChosen((now) => new Map(now).set(key(status, root), true))
      if (pastLimit) showAll(status, root)
    },
  }
}
