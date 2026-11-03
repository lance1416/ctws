import type { NoteFolderResponse } from '@ctws/contracts'
import { useDraggable, useDroppable } from '@dnd-kit/core'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { type ReactNode, useState } from 'react'
import { problemText } from '../../../platform/http/api'
import { DeleteConfirm } from '../../../platform/ui/DeleteConfirm'
import { CollapseIcon, MoreIcon, NewIcon } from '../../../platform/ui/icons'
import { MENU_ITEM, MENU_SURFACE } from '../../../platform/ui/menuSurface'
import { useFolderActions } from '../hooks/useFolderActions'
import { RowNameField } from './RowNameField'

/** What a note or a folder dragged in the sidebar is dropped on: a folder, or none (FR-110). */
export const dropOn = (folder: NoteFolderResponse | null) => `folder:${folder?.id ?? 'none'}`

/** A folder being dragged, told apart from a note's id. */
export const dragOf = (folder: NoteFolderResponse) => `move:${folder.id}`

/**
 * A FOLDER IN THE SIDEBAR (FR-110, FR-115, FR-117, artboards 38 and 40): its name and the count of
 * every note under it, opened to the folders in it and its notes, each level 16 further in. On
 * hover its count gives way to "+", a new note in it, and "…", the same menu as a right press:
 * New note; New folder, but on the third level; Rename, in its row; Delete…, asked first unless it
 * is empty. A note or a folder dragged onto it goes in, where it may (`refuses` otherwise).
 */
export function FolderRow({
  folder,
  count,
  open,
  onToggle,
  onNewNote,
  onNewFolder,
  asked,
  refuses,
  children,
}: {
  folder: NoteFolderResponse
  count: number
  open: boolean
  onToggle: () => void
  onNewNote: () => void
  /** A folder in this one; none on the third level. */
  onNewFolder: (() => void) | null
  /** The question before it goes; null when it is empty, and goes unasked. */
  asked: string | null
  /** A folder being dragged may not go in here: too deep, or into itself. */
  refuses: boolean
  children: ReactNode
}) {
  const actions = useFolderActions()
  const [menu, setMenu] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [asking, setAsking] = useState(false)
  const drop = useDroppable({ id: dropOn(folder), disabled: refuses })
  const drag = useDraggable({ id: dragOf(folder), disabled: renaming })
  const remove = () => actions.remove.mutate(folder.id, { onSuccess: () => setAsking(false) })

  return (
    <li data-folder-row={folder.id} className={drag.isDragging ? 'opacity-40' : ''}>
      {renaming ? (
        <RowNameField
          initial={folder.name}
          label={`Rename ${folder.name}`}
          error={actions.rename.isError ? problemText(actions.rename.error) : null}
          onCommit={(name) =>
            actions.rename.mutate({ id: folder.id, name }, { onSuccess: () => setRenaming(false) })
          }
          onCancel={() => {
            actions.rename.reset()
            setRenaming(false)
          }}
        />
      ) : (
        <div
          ref={(el) => {
            drop.setNodeRef(el)
            drag.setNodeRef(el)
          }}
          {...drag.listeners}
          onContextMenu={(e) => {
            e.preventDefault()
            setMenu(true)
          }}
          className={`group mx-1.5 flex h-7.5 items-center rounded-control text-ui text-ink hover:bg-hover ${
            drop.isOver ? 'bg-select outline-1 -outline-offset-1 outline-task' : ''
          }`}
        >
          <button
            type="button"
            aria-expanded={open}
            onClick={onToggle}
            className="flex h-full min-w-0 flex-1 items-center gap-2 pl-2"
          >
            <CollapseIcon
              size={14}
              aria-hidden="true"
              className={`shrink-0 text-muted transition-transform ${open ? 'rotate-90' : ''}`}
            />
            <span className="flex-1 truncate text-left">{folder.name}</span>
          </button>
          <button
            type="button"
            aria-label={`New note in ${folder.name}`}
            title={`New note in ${folder.name}`}
            onClick={onNewNote}
            className={`size-6 place-items-center rounded-control text-muted group-focus-within:grid group-hover:grid hover:text-ink ${
              menu ? 'grid' : 'hidden'
            }`}
          >
            <NewIcon size={14} aria-hidden="true" />
          </button>
          <DropdownMenu.Root open={menu} onOpenChange={setMenu} modal={false}>
            <DropdownMenu.Trigger
              aria-label={`More for ${folder.name}`}
              // Shown on hover, and while the row has the keyboard, so Tab reaches it.
              className={`size-6 place-items-center rounded-control text-muted group-focus-within:grid group-hover:grid hover:text-ink ${
                menu ? 'grid' : 'hidden'
              }`}
            >
              <MoreIcon size={14} aria-hidden="true" />
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content align="end" sideOffset={4} className={MENU_SURFACE}>
                <DropdownMenu.Item onSelect={onNewNote} className={MENU_ITEM}>
                  New note
                  <span className="ml-auto pl-4 text-meta text-muted">N N</span>
                </DropdownMenu.Item>
                {onNewFolder && (
                  <DropdownMenu.Item onSelect={onNewFolder} className={MENU_ITEM}>
                    New folder
                  </DropdownMenu.Item>
                )}
                <DropdownMenu.Separator className="my-1 h-px bg-line" />
                <DropdownMenu.Item onSelect={() => setRenaming(true)} className={MENU_ITEM}>
                  Rename
                </DropdownMenu.Item>
                <DropdownMenu.Item
                  onSelect={() => (asked === null ? remove() : setAsking(true))}
                  className={`${MENU_ITEM} text-stop-t`}
                >
                  Delete…
                </DropdownMenu.Item>
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
          <span
            data-count
            className={`pr-2 pl-1 text-meta text-muted tabular-nums group-focus-within:hidden group-hover:hidden ${
              menu ? 'hidden' : ''
            }`}
          >
            {/* An empty folder says no number, not 0. */}
            {count || null}
          </span>
        </div>
      )}
      {open && <ul className="flex flex-col gap-px pl-4">{children}</ul>}
      {asking && asked !== null && (
        <DeleteConfirm
          label={`Delete ${folder.name}`}
          message={asked}
          confirm={`Delete ${folder.name}`}
          busy={actions.remove.isPending}
          onConfirm={remove}
          onCancel={() => setAsking(false)}
        />
      )}
    </li>
  )
}
