import type { NoteResponse } from '@ctws/contracts'
import { useDraggable } from '@dnd-kit/core'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import { problemText } from '../../../platform/http/api'
import { DeleteConfirm } from '../../../platform/ui/DeleteConfirm'
import { KIND_ICON, MoreIcon } from '../../../platform/ui/icons'
import { KIND_TEXT } from '../../../platform/ui/kinds'
import { MENU_ITEM, MENU_SURFACE } from '../../../platform/ui/menuSurface'
import { useDestroy } from '../../../shell/detail'
import { deleteNote, noteKeys, notesQuery, patchNote } from '../api'
import { useShelveNote } from '../hooks/useShelveNote'
import { NOTES_ID } from '../logic/id'
import { noteTitle } from '../logic/title'
import { downloadNote, MoveToFolder } from './NoteMenu'
import { RowNameField } from './RowNameField'

export const NOTE_ROW = ({ isActive }: { isActive: boolean }) =>
  `mx-1.5 flex h-7.5 items-center gap-2 rounded-control px-2 text-ui hover:bg-hover ${
    isActive ? 'bg-select font-medium text-ink' : 'text-ink'
  }`

/**
 * A NOTE IN THE SIDEBAR (FR-110, FR-114, artboard 38): its name, with its kind's mark, a note's
 * own or what it hangs on. On hover its "…", and the same menu on a right press: Rename, in its
 * row; Pin; Move to a folder…; Download as .md; Delete…, asked once, the next in the list shown
 * after it. One on its own is dragged to a folder; one on a thing goes where the thing is, so it
 * has no pin and no folder.
 */
export function NoteRow({
  note,
  onDeleted,
}: {
  note: NoteResponse
  /** Where to go once it is gone: the next note in the list. */
  onDeleted: () => void
}) {
  const type = note.anchor?.type ?? 'note'
  const Icon = KIND_ICON[type]
  const own = note.anchor === null
  const drag = useDraggable({ id: note.id, disabled: !own })
  const shelve = useShelveNote()
  const rename = useRenameNote()
  const drop = useDestroy({
    type: 'note',
    id: note.id,
    remove: () => deleteNote(note.id),
    awaits: [noteKeys.all],
    onDone: onDeleted,
  })
  const [menu, setMenu] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [asking, setAsking] = useState(false)
  const title = noteTitle(note)

  if (renaming)
    return (
      <li data-note-row={note.id}>
        <RowNameField
          initial={note.title ?? ''}
          label={`Rename ${title}`}
          error={rename.isError ? problemText(rename.error) : null}
          onCommit={(name) =>
            rename.mutate({ note, title: name }, { onSuccess: () => setRenaming(false) })
          }
          onCancel={() => {
            rename.reset()
            setRenaming(false)
          }}
        />
      </li>
    )
  return (
    <li
      data-note-row={note.id}
      ref={drag.setNodeRef}
      {...drag.listeners}
      className={drag.isDragging ? 'opacity-40' : ''}
    >
      <div
        onContextMenu={(e) => {
          e.preventDefault()
          setMenu(true)
        }}
        className="group relative"
      >
        <NavLink to={`/${NOTES_ID}/${note.id}`} className={NOTE_ROW}>
          <Icon size={14} aria-hidden="true" className={`shrink-0 ${KIND_TEXT[type]}`} />
          <span className="truncate pr-6">{title}</span>
        </NavLink>
        <DropdownMenu.Root open={menu} onOpenChange={setMenu} modal={false}>
          <DropdownMenu.Trigger
            aria-label={`More for ${title}`}
            // Shown on hover, and while the row has the keyboard, so Tab reaches it.
            className={`absolute top-0.75 right-2.5 size-6 place-items-center rounded-control text-muted group-focus-within:grid group-hover:grid hover:bg-hover hover:text-ink ${
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
              {own && (
                <DropdownMenu.Item
                  onSelect={() => shelve.mutate({ id: note.id, pinned: note.pinnedAt === null })}
                  className={MENU_ITEM}
                >
                  {note.pinnedAt === null ? 'Pin' : 'Unpin'}
                </DropdownMenu.Item>
              )}
              {own && (
                <DropdownMenu.Sub>
                  <DropdownMenu.SubTrigger className={MENU_ITEM}>
                    Move to a folder…
                  </DropdownMenu.SubTrigger>
                  <DropdownMenu.Portal>
                    <DropdownMenu.SubContent sideOffset={4} className={MENU_SURFACE}>
                      <MoveToFolder note={note} />
                    </DropdownMenu.SubContent>
                  </DropdownMenu.Portal>
                </DropdownMenu.Sub>
              )}
              <DropdownMenu.Item
                onSelect={() => downloadNote(title, note.body)}
                className={MENU_ITEM}
              >
                Download as .md
              </DropdownMenu.Item>
              <DropdownMenu.Separator className="my-1 h-px bg-line" />
              <DropdownMenu.Item
                onSelect={() => setAsking(true)}
                className={`${MENU_ITEM} text-stop-t`}
              >
                Delete…
              </DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      </div>
      {asking && (
        <DeleteConfirm
          label={`Delete ${title}`}
          message={`Delete ${title}? The note goes, with everything written in it. The people and things it mentions stay.`}
          confirm={`Delete ${title}`}
          busy={drop.isPending}
          onConfirm={() => drop.mutate(undefined, { onSettled: () => setAsking(false) })}
          onCancel={() => setAsking(false)}
        />
      )}
    </li>
  )
}

/** A note's title, written in its row (FR-114): the list and the page take it at once. */
function useRenameNote() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ note, title }: { note: NoteResponse; title: string }) =>
      patchNote(note.id, { title }),
    meta: { changes: ['note'] },
    onSuccess: (saved) =>
      qc.setQueryData(notesQuery().queryKey, (was: NoteResponse[] = []) =>
        was.map((n) => (n.id === saved.id ? saved : n)),
      ),
  })
}
