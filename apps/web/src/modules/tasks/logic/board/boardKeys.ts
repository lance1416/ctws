import type { TaskId, TaskStatus } from '@ctws/contracts'
import { BOARD_ORDER } from './boardColumns'

/** The cards a column shows, top to bottom; a folded strip shows none. */
export type ShownColumn = { status: TaskStatus; ids: readonly TaskId[] }

/**
 * Where an arrow takes the selection (FR-029, the board): up and down within the column, left and
 * right to the same place in the nearest column beside it that shows a card, or the last card
 * there when it is shorter. Nowhere to go stays put.
 */
export function cardBeside(
  columns: readonly { ids: readonly TaskId[] }[],
  from: TaskId,
  key: 'ArrowUp' | 'ArrowDown' | 'ArrowLeft' | 'ArrowRight',
): TaskId {
  const col = columns.findIndex((c) => c.ids.includes(from))
  if (col < 0) return from
  const row = columns[col]!.ids.indexOf(from)
  if (key === 'ArrowUp') return columns[col]!.ids[row - 1] ?? from
  if (key === 'ArrowDown') return columns[col]!.ids[row + 1] ?? from
  const step = key === 'ArrowLeft' ? -1 : 1
  for (let c = col + step; c >= 0 && c < columns.length; c += step) {
    const ids = columns[c]!.ids
    if (ids.length > 0) return ids[Math.min(row, ids.length - 1)]!
  }
  return from
}

/** The status beside this one on the board, folded strips included; none past either end. */
export function statusBeside(status: TaskStatus, step: -1 | 1): TaskStatus | null {
  return BOARD_ORDER[BOARD_ORDER.indexOf(status) + step] ?? null
}
