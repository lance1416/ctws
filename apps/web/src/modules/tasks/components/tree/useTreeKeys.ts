import { type TaskStatus, type TaskId } from '@ctws/contracts'
import type { KeyboardEvent } from 'react'
import { useKeyTable } from '../../../../platform/keyboard/keyTable'
import { statusActions, TREE_KEYS } from '../../logic/keys'
import type { FlatRow } from '../../logic/tree/flatten'

/** What the tree's keys do to the row at an index, by the table in `TREE_KEYS`. */
export function useTreeKeys({
  rows,
  statusOf,
  setStatus,
  open,
  addChild,
  addSibling,
  move,
  blockLength,
  toggle,
  focusRow,
}: {
  rows: readonly FlatRow[]
  statusOf: (id: TaskId) => TaskStatus
  setStatus: (id: TaskId, status: TaskStatus) => void
  open: (id: TaskId) => void
  addChild: (row: FlatRow) => void
  addSibling: (row: FlatRow) => void
  /** Drops `id` at `slot` (an index into `rows`) at `depth`, as a drag would. */
  move: (id: TaskId, slot: number, depth: number) => void
  blockLength: (index: number) => number
  toggle: (id: TaskId) => void
  /** Focuses the row at an index, if there is one. */
  focusRow: (index: number) => void
}) {
  const keys = useKeyTable(TREE_KEYS)

  return (e: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const row = rows[index]!
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
        move(row.id, j, row.depth)
      },
      moveDown: () => {
        // After the next row's whole visible block, not between it and its first child.
        const next = index + blockLength(index)
        if (next < rows.length) move(row.id, next + blockLength(next), row.depth)
      },
      indent: () => move(row.id, index, row.depth + 1),
      outdent: () => move(row.id, index, row.depth - 1),
      // Clamped, not wrapping: a jump from bottom to top loses the person's place.
      next: () => focusRow(index + 1),
      previous: () => focusRow(index - 1),
      first: () => focusRow(0),
      last: () => focusRow(rows.length - 1),
      expand: () => {
        if (row.hasChildren && row.collapsed) toggle(row.id)
        else if (row.hasChildren) focusRow(index + 1)
      },
      collapse: () => {
        if (row.hasChildren && !row.collapsed) toggle(row.id)
        else if (row.parentId) {
          const parent = rows.findIndex((r) => r.id === row.parentId)
          if (parent >= 0) focusRow(parent)
        }
      },
    })
  }
}
