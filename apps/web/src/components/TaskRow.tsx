import { useSortable } from '@dnd-kit/sortable'
import type { KeyboardEvent } from 'react'
import type { FlatRow } from '../tree/flatten'

const INDENT_PX = 20

type Props = {
  row: FlatRow
  title: string
  onToggle: () => void
  onKeyDown: (e: KeyboardEvent<HTMLButtonElement>) => void
  onOpen: () => void
}

export function TaskRow({ row, title, onToggle, onKeyDown, onOpen }: Props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: row.id,
  })

  return (
    <li
      ref={setNodeRef}
      role="listitem"
      data-depth={row.depth}
      // A click on the row body opens the detail; the chevron and the handle are buttons with
      // their own jobs. A drag starts on the handle, so it never reaches here as a row click.
      onClick={(e) => {
        if (!(e.target as HTMLElement).closest('button')) onOpen()
      }}
      style={{
        // Pixel indentation is layout, not colour.
        paddingLeft: (row.depth - 1) * INDENT_PX,
        transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
        transition,
      }}
      className={`flex cursor-pointer items-center gap-2 rounded py-1 ${isDragging ? 'bg-surface-sunken opacity-70' : ''}`}
    >
      {/* Gated on hasChildren, not on collapsed: a stale collapsed id for a row that has since
          become a leaf yields collapsed: true with no children, and must not show a chevron. */}
      {row.hasChildren ? (
        <button
          type="button"
          aria-label={row.collapsed ? '展开' : '折叠'}
          aria-expanded={!row.collapsed}
          onClick={onToggle}
          className="w-5 text-fg-muted"
        >
          {row.collapsed ? '▸' : '▾'}
        </button>
      ) : (
        <span className="w-5" aria-hidden="true" />
      )}
      {/* The focus carrier and the pointer drag handle. Only the pointer sensor is registered,
          so `listeners` is just onPointerDown and our own onKeyDown owns the keyboard. */}
      <button
        type="button"
        aria-label={`任务：${title}`}
        data-handle-id={row.id}
        {...attributes}
        {...listeners}
        onKeyDown={onKeyDown}
        className="cursor-grab touch-none text-fg-subtle"
      >
        ⋮⋮
      </button>
      <span className="text-fg">{title}</span>
    </li>
  )
}
