import type { NoteFolderId, NoteResponse } from '@ctws/contracts'
import { sourceWords } from '../../../platform/editor/SourceButton'
import { SOURCE_KEYS } from '../../../platform/editor/noteKeys'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { useQuery } from '@tanstack/react-query'
import { ICON_BUTTON } from '../../../platform/ui/buttonStyles'
import { MoreIcon, PinIcon } from '../../../platform/ui/icons'
import { MENU_ITEM, MENU_SURFACE } from '../../../platform/ui/menuSurface'
import { foldersQuery } from '../api'
import { fileNameOf } from '../logic/download'
import { askNewFolder, askReveal } from '../hooks/sidebarAsk'
import { useShelveNote } from '../hooks/useShelveNote'

/** Hands the browser the note's text as a `.md` file named for it (FR-111). */
export function downloadNote(title: string, body: string) {
  const url = URL.createObjectURL(new Blob([body], { type: 'text/markdown;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = fileNameOf(title)
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
  source,
  onSource,
}: {
  note: NoteResponse | null
  title: string
  body: string
  /** The note shown as its source (FR-116), and the switch. */
  source: boolean
  onSource: () => void
}) {
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
              <MoveToFolder note={note} />
              <DropdownMenu.Separator className="my-1 h-px bg-line" />
            </>
          )}
          <DropdownMenu.Item onSelect={onSource} className={MENU_ITEM}>
            {sourceWords(source)}
            <span className="ml-auto pl-4 text-meta text-subtle">{SOURCE_KEYS}</span>
          </DropdownMenu.Item>
          <DropdownMenu.Item onSelect={() => downloadNote(title, body)} className={MENU_ITEM}>
            Download .md
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}

/**
 * The folders a note on its own can go in, the one it is in ticked, then none, then a new one
 * made in the sidebar's own row with this note put in it (FR-110, DES-001): the note page's "…"
 * lists them under its label, the sidebar's under "Move to a folder…".
 */
export function MoveToFolder({ note }: { note: NoteResponse }) {
  const folders = useQuery(foldersQuery()).data ?? []
  const shelve = useShelveNote()
  return (
    <>
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
    </>
  )
}

/**
 * The pin beside a note on its own's title, one switch (FR-110, DES-001): ink while the note is
 * pinned, muted while it is not; its hover says what a press does.
 */
export function PinButton({ note }: { note: NoteResponse }) {
  const shelve = useShelveNote()
  const pinned = note.pinnedAt !== null
  return (
    <button
      type="button"
      aria-pressed={pinned}
      aria-label="Pin"
      title={pinned ? 'Unpin' : 'Pin'}
      onClick={() => shelve.mutate({ id: note.id, pinned: !pinned })}
      // The variant, not a plain `text-ink`: the button's own `text-muted` would win over that.
      className={`${ICON_BUTTON} aria-pressed:text-ink`}
    >
      <PinIcon size={16} aria-hidden="true" />
    </button>
  )
}

/**
 * The head's tag for the folder a note is in, its name alone: a folder is no kind, and the folder
 * glyph is a project's. A press shows the note in the sidebar (DES-001).
 */
export function FolderTag({ note }: { note: NoteResponse }) {
  const folder = useQuery(foldersQuery()).data?.find((f) => f.id === note.folderId)
  if (!folder) return null
  return (
    <button
      type="button"
      onClick={() => askReveal(note.id)}
      // Its ground always the hover grey, as a tag's; not only under the pointer.
      className="inline-flex h-5.5 items-center rounded-control bg-hover px-1.5 text-meta text-muted hover:text-ink"
    >
      {folder.name}
    </button>
  )
}
