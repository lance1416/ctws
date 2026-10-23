import { type TaskStatus, type TaskId } from '@ctws/contracts'
import type { KeyboardEvent } from 'react'
import { useKeyTable } from '../../../../platform/keyboard/keyTable'
import { statusActions, TREE_KEYS } from '../../logic/keys'
import { blockLength, type FlatRow } from '../../logic/tree/flatten'

/**
 * What the tree's keys do to a row, by the table in `TREE_KEYS`. They read the rows as they are
 * when the key is pressed: a second move pressed before the first one has rendered starts from
 * where the first put the row, not from where the screen still shows it.
 */
export function useTreeKeys({
  rows: rowsNow,
  statusOf,
  setStatus,
  open,
  addChild,
  addSibling,
  move,
  toggle,
  focusRow,
  moveTo,
}: {
  rows: () => readonly FlatRow[]
  statusOf: (id: TaskId) => TaskStatus
  setStatus: (id: TaskId, status: TaskStatus) => void
  open: (id: TaskId) => void
  addChild: (row: FlatRow) => void
  addSibling: (row: FlatRow) => void
  /** Drops `id` at `slot` (an index into `rows`) at `depth`, as a drag would. */
  move: (rows: readonly FlatRow[], id: TaskId, slot: number, depth: number) => void
  toggle: (id: TaskId) => void
  /** Focuses this row, if there is one. */
  focusRow: (row: FlatRow | undefined) => void
  /** Opens Move to… for this row; only the inbox's rows have it (FR-059). */
  moveTo?: ((id: TaskId) => void) | undefined
}) {
  const keys = useKeyTable(TREE_KEYS)

  return (e: KeyboardEvent<HTMLButtonElement>, id: TaskId) => {
    const rows = rowsNow()
    const index = rows.findIndex((r) => r.id === id)
    const row = rows[index]
    if (!row) return
    keys(e, {
      ...statusActions(statusOf(row.id), (next) => setStatus(row.id, next)),
      open: () => open(row.id),
      addChild: () => addChild(row),
      addSibling: () => addSibling(row),
      moveUp: () => {
        // Over the previous sibling's whole visible block: index - 1 would land inside an expanded
        // subtree above and drag the row into it.
        let j = index - 1
        while (j > 0 && rows[j]!.depth > row.depth) j--
        move(rows, row.id, j, row.depth)
      },
      moveDown: () => {
        // After the next row's whole visible block, not between it and its first child.
        const next = index + blockLength(rows, index)
        if (next < rows.length) move(rows, row.id, next + blockLength(rows, next), row.depth)
      },
      ...(moveTo ? { moveTo: () => moveTo(row.id) } : {}),
      indent: () => move(rows, row.id, index, row.depth + 1),
      outdent: () => move(rows, row.id, index, row.depth - 1),
      // Clamped, not wrapping: a jump from bottom to top loses the person's place.
      next: () => focusRow(rows[index + 1]),
      previous: () => focusRow(rows[index - 1]),
      first: () => focusRow(rows[0]),
      last: () => focusRow(rows.at(-1)),
      expand: () => {
        if (row.hasChildren && row.collapsed) toggle(row.id)
        else if (row.hasChildren) focusRow(rows[index + 1])
      },
      collapse: () => {
        if (row.hasChildren && !row.collapsed) toggle(row.id)
        else if (row.parentId) focusRow(rows.find((r) => r.id === row.parentId))
      },
    })
  }
}
