import type { NoteFolderResponse } from '@ctws/contracts'
import { useDroppable } from '@dnd-kit/core'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { type ReactNode, useState } from 'react'
import { problemText } from '../../../platform/http/api'
import { DeleteConfirm } from '../../../platform/ui/DeleteConfirm'
import { CollapseIcon, MoreIcon } from '../../../platform/ui/icons'
import { MENU_ITEM, MENU_SURFACE } from '../../../platform/ui/menuSurface'
import { useFolderActions } from '../hooks/useFolderActions'
import { FolderNameField } from './FolderNameField'

/** What a note dragged in the sidebar is dropped on: a folder, or none (FR-110). */
export const dropOn = (folder: NoteFolderResponse | null) => `folder:${folder?.id ?? 'none'}`

/**
 * A FOLDER IN THE SIDEBAR (FR-110, DES-001 "文件夹和置顶"): its name and count, opened to its
 * notes. On hover its "…", and the same menu on a right press: Rename, in its row; Delete, asked
 * first unless it is empty, its notes left in none. A note dragged onto it goes in.
 */
export function FolderRow({
  folder,
  count,
  open,
  onToggle,
  children,
}: {
  folder: NoteFolderResponse
  count: number
  open: boolean
  onToggle: () => void
  children: ReactNode
}) {
  const actions = useFolderActions()
  const [menu, setMenu] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [asking, setAsking] = useState(false)
  const drop = useDroppable({ id: dropOn(folder) })
  const remove = () => actions.remove.mutate(folder.id, { onSuccess: () => setAsking(false) })
  const notes = count === 1 ? 'its note stays' : `its ${count} notes stay`

  return (
    <li data-folder-row={folder.id}>
      {renaming ? (
        <FolderNameField
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
          ref={drop.setNodeRef}
          onContextMenu={(e) => {
            e.preventDefault()
            setMenu(true)
          }}
          className={`group mx-1.5 flex h-7.5 items-center rounded-control text-ui text-ink hover:bg-hover ${
            drop.isOver ? 'bg-select' : ''
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
                <DropdownMenu.Item onSelect={() => setRenaming(true)} className={MENU_ITEM}>
                  Rename
                </DropdownMenu.Item>
                <DropdownMenu.Item
                  onSelect={() => (count === 0 ? remove() : setAsking(true))}
                  className={`${MENU_ITEM} text-stop-t`}
                >
                  Delete
                </DropdownMenu.Item>
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
          <span
            data-count
            className={`pr-2 pl-1 text-meta text-subtle tabular-nums group-focus-within:hidden group-hover:hidden ${
              menu ? 'hidden' : ''
            }`}
          >
            {count}
          </span>
        </div>
      )}
      {open && <ul className="flex flex-col gap-px pl-5.5">{children}</ul>}
      {asking && (
        <DeleteConfirm
          label={`Delete ${folder.name}`}
          message={`Delete ${folder.name}? The folder goes; ${notes}, in Not in a folder.`}
          confirm={`Delete ${folder.name}`}
          busy={actions.remove.isPending}
          onConfirm={remove}
          onCancel={() => setAsking(false)}
        />
      )}
    </li>
  )
}
