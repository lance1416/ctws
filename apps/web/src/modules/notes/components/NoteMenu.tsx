import type { NoteFolderId, NoteResponse } from '@ctws/contracts'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { useQuery } from '@tanstack/react-query'
import { ICON_BUTTON } from '../../../platform/ui/buttonStyles'
import { FolderIcon, MoreIcon, PinIcon, UnpinIcon } from '../../../platform/ui/icons'
import { MENU_ITEM, MENU_SURFACE } from '../../../platform/ui/menuSurface'
import { foldersQuery } from '../api'
import { fileNameOf } from '../logic/download'
import { askNewFolder, askReveal } from '../hooks/sidebarAsk'
import { useShelveNote } from '../hooks/useShelveNote'

/** Hands the browser `text` as a file called `name`. */
function save(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/markdown;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  URL.revokeObjectURL(url)
}

/** What "No folder" stands for in the radio group, which takes strings only. */
const NONE = ''

/**
 * A note's "…" (artboard 34): Move to folder, for a note on its own, ending with New folder…
 * (FR-110); Download .md, the text as it is written (FR-111).
 */
export function NoteMenu({
  note,
  title,
  body,
}: {
  note: NoteResponse | null
  title: string
  body: string
}) {
  const folders = useQuery(foldersQuery()).data ?? []
  const shelve = useShelveNote()
  const filing = note !== null && note.anchor === null
  return (
    <DropdownMenu.Root modal={false}>
      <DropdownMenu.Trigger aria-label="More" title="More" className={`${ICON_BUTTON} shrink-0`}>
        <MoreIcon size={16} aria-hidden="true" />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align="end" sideOffset={4} className={MENU_SURFACE}>
          {filing && (
            <>
              <DropdownMenu.Label className="px-2 pt-1 pb-0.5 text-meta text-muted">
                Move to folder
              </DropdownMenu.Label>
              <DropdownMenu.RadioGroup
                value={note.folderId ?? NONE}
                onValueChange={(v) =>
                  shelve.mutate({ id: note.id, folderId: v === NONE ? null : (v as NoteFolderId) })
                }
              >
                {folders.map((f) => (
                  <DropdownMenu.RadioItem key={f.id} value={f.id} className={MENU_ITEM}>
                    <span className="flex-1 truncate">{f.name}</span>
                    <DropdownMenu.ItemIndicator className="text-meta text-muted">
                      ✓
                    </DropdownMenu.ItemIndicator>
                  </DropdownMenu.RadioItem>
                ))}
                <DropdownMenu.RadioItem value={NONE} className={MENU_ITEM}>
                  <span className="flex-1">No folder</span>
                  <DropdownMenu.ItemIndicator className="text-meta text-muted">
                    ✓
                  </DropdownMenu.ItemIndicator>
                </DropdownMenu.RadioItem>
              </DropdownMenu.RadioGroup>
              {/* Made in the sidebar's own row, and this note put in it (DES-001). */}
              <DropdownMenu.Item onSelect={() => askNewFolder(note.id)} className={MENU_ITEM}>
                New folder…
              </DropdownMenu.Item>
              <DropdownMenu.Separator className="my-1 h-px bg-line" />
            </>
          )}
          <DropdownMenu.Item onSelect={() => save(fileNameOf(title), body)} className={MENU_ITEM}>
            Download .md
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}

/** The pin beside a note on its own's title: on the list's top, or off it (FR-110). */
export function PinButton({ note }: { note: NoteResponse }) {
  const shelve = useShelveNote()
  const pinned = note.pinnedAt !== null
  const Icon = pinned ? UnpinIcon : PinIcon
  return (
    <button
      type="button"
      aria-pressed={pinned}
      aria-label={pinned ? 'Unpin' : 'Pin'}
      title={pinned ? 'Unpin' : 'Pin to the top'}
      onClick={() => shelve.mutate({ id: note.id, pinned: !pinned })}
      className={`${ICON_BUTTON} shrink-0 ${pinned ? 'text-ink' : ''}`}
    >
      <Icon size={16} aria-hidden="true" />
    </button>
  )
}

/** The head's tag for the folder a note is in: a press shows the note in the sidebar (DES-001). */
export function FolderTag({ note }: { note: NoteResponse }) {
  const folder = useQuery(foldersQuery()).data?.find((f) => f.id === note.folderId)
  if (!folder) return null
  return (
    <button
      type="button"
      onClick={() => askReveal(note.id)}
      className="inline-flex h-5.5 items-center gap-1 rounded-control border border-line px-1.5 text-meta text-muted hover:bg-hover hover:text-ink"
    >
      <FolderIcon size={12} aria-hidden="true" />
      {folder.name}
    </button>
  )
}
