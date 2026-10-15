import type { TaskStatus } from '@ctws/contracts'
import type { KeyboardEvent } from 'react'
import { useShortcutsEnabled } from '../../../../platform/keyboard/enabled'
import type { FlatRow } from '../../tree/flatten'
import { statusForKey } from '../StatusControls'

/**
 * The tree's keys on a focused row: bare arrows move focus and fold, Alt+arrows move the row and
 * change its depth. Tab is unbound, so one Tab leaves the tree.
 */
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
}: {
  rows: readonly FlatRow[]
  statusOf: (id: string) => TaskStatus
  setStatus: (id: string, status: TaskStatus) => void
  open: (id: string) => void
  addChild: (row: FlatRow) => void
  addSibling: (row: FlatRow) => void
  /** Drops `id` at `slot` (an index into `rows`) at `depth`, as a drag would. */
  move: (id: string, slot: number, depth: number) => void
  blockLength: (index: number) => number
  toggle: (id: string) => void
}) {
  const singleKeys = useShortcutsEnabled()
  const focusRow = (index: number) => {
    const row = rows[index]
    if (!row) return
    document.querySelector<HTMLElement>(`[data-handle-id="${row.id}"]`)?.focus()
  }

  return (e: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const row = rows[index]!
    // Bare, with no Shift either: Shift+Enter is another command and Shift+arrow a selection
    // gesture this does not own.
    const plain = !e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey
    const nextStatus = singleKeys ? statusForKey(e, statusOf(row.id)) : null
    if (nextStatus) {
      e.preventDefault()
      setStatus(row.id, nextStatus)
    } else if (e.key === 'Enter' && e.altKey) {
      e.preventDefault()
      addChild(row)
    } else if (e.key === 'Enter' && e.shiftKey) {
      // Plain Enter opens the detail (the keyboard way in), so a sibling is Shift+Enter.
      e.preventDefault()
      addSibling(row)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      open(row.id)
    } else if (e.altKey && e.key === 'ArrowUp') {
      e.preventDefault()
      // Over the previous sibling's whole visible block: index - 1 would land inside an expanded
      // subtree above and drag the row into it.
      let j = index - 1
      while (j > 0 && rows[j]!.depth > row.depth) j--
      move(row.id, j, row.depth)
    } else if (e.altKey && e.key === 'ArrowDown') {
      e.preventDefault()
      // After the next row's whole visible block, not between it and its first child.
      const next = index + blockLength(index)
      if (next < rows.length) move(row.id, next + blockLength(next), row.depth)
    } else if (e.altKey && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) {
      e.preventDefault()
      move(row.id, index, row.depth + (e.key === 'ArrowRight' ? 1 : -1))
    } else if (plain && (e.key === 'ArrowDown' || (singleKeys && e.key === 'j'))) {
      // Clamped, not wrapping: a jump from bottom to top loses the person's place.
      e.preventDefault()
      focusRow(index + 1)
    } else if (plain && (e.key === 'ArrowUp' || (singleKeys && e.key === 'k'))) {
      e.preventDefault()
      focusRow(index - 1)
    } else if (plain && e.key === 'Home') {
      e.preventDefault()
      focusRow(0)
    } else if (plain && e.key === 'End') {
      e.preventDefault()
      focusRow(rows.length - 1)
    } else if (plain && e.key === 'ArrowRight') {
      e.preventDefault()
      if (row.hasChildren && row.collapsed) toggle(row.id)
      else if (row.hasChildren) focusRow(index + 1)
    } else if (plain && e.key === 'ArrowLeft') {
      e.preventDefault()
      if (row.hasChildren && !row.collapsed) toggle(row.id)
      else if (row.parentId) {
        const parent = rows.findIndex((r) => r.id === row.parentId)
        if (parent >= 0) focusRow(parent)
      }
    }
  }
}
