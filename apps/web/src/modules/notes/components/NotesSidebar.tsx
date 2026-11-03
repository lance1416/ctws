import type { NoteFolderId, NoteResponse } from '@ctws/contracts'
import {
  DndContext,
  type DragEndEvent,
  DragOverlay,
  PointerSensor,
  pointerWithin,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import { useQuery } from '@tanstack/react-query'
import { type ReactNode, useEffect, useState } from 'react'
import { useMatch, useNavigate, useSearchParams } from 'react-router-dom'
import { problemText } from '../../../platform/http/api'
import { ICON_BUTTON } from '../../../platform/ui/buttonStyles'
import { KIND_ICON, NewIcon, PinIcon } from '../../../platform/ui/icons'
import { KIND_TEXT } from '../../../platform/ui/kinds'
import { FILTER_FROM, FilteredEmpty, SidebarFilter } from '../../../shell/layout'
import { foldersQuery, notesQuery } from '../api'
import { answered, askNewFolder, useSidebarAsk } from '../hooks/sidebarAsk'
import { useFolderActions } from '../hooks/useFolderActions'
import { useShelveNote } from '../hooks/useShelveNote'
import { NOTES_ID } from '../logic/id'
import { shelvesOf } from '../logic/shelves'
import { noteTitle } from '../logic/title'
import { RowNameField } from './RowNameField'
import { dropOn, FolderRow } from './FolderRow'
import { NOTE_ROW, NoteRow } from './NoteRow'

/** How many notes on other things are listed before their "All N". */
const ON_THINGS_SHOWN = 5

/**
 * THE NOTES SIDEBAR (REQ-002 FR-110, artboard 34, DES-001 "文件夹和置顶"): the pinned, then the
 * folders, each opened to its notes, then the notes in none, then those on other things, the first
 * few and their "All N". The folder of the note on the page is open. A note on its own is dragged
 * onto a folder to go in, onto Not in a folder to come out; Move to folder does the same by keys.
 */
export function NotesSidebar() {
  const notes = useQuery(notesQuery())
  const folders = useQuery(foldersQuery())
  const actions = useFolderActions()
  const shelve = useShelveNote()
  const ask = useSidebarAsk()
  const [typed, setTyped] = useState('')
  const [opened, setOpened] = useState<ReadonlySet<NoteFolderId>>(new Set())
  // Closed by hand: the open note's folder too, until its tag asks for it again.
  const [closed, setClosed] = useState<ReadonlySet<NoteFolderId>>(new Set())
  const [allOnThings, setAllOnThings] = useState(false)
  const [dragged, setDragged] = useState<NoteResponse | null>(null)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))
  const here = useMatch(`/${NOTES_ID}/:id`)?.params.id
  const navigate = useNavigate()
  // A note being made in a folder (FR-115): it sits at the top of it until it is written in.
  const [search] = useSearchParams()
  const newIn = here === 'new' ? (search.get('folder') as NoteFolderId | null) : null
  const all = notes.data ?? []
  const filtering = typed.trim() !== ''
  const s = shelvesOf(all, folders.data ?? [], typed)
  const current = all.find((n) => n.id === here)
  const isOpen = (id: NoteFolderId) =>
    filtering || newIn === id || (!closed.has(id) && (opened.has(id) || current?.folderId === id))
  const open = (id: NoteFolderId) => {
    setOpened((was) => new Set([...was, id]))
    setClosed((was) => new Set([...was].filter((c) => c !== id)))
  }
  const toggle = (id: NoteFolderId) => {
    if (!isOpen(id)) return open(id)
    setOpened((was) => new Set([...was].filter((o) => o !== id)))
    setClosed((was) => new Set([...was, id]))
  }
  const creating = ask.newFolderFor !== null

  // The head's folder tag: that folder opened, and the note's row brought into view.
  useEffect(() => {
    if (!ask.reveal) return
    const note = all.find((n) => n.id === ask.reveal)
    if (note?.folderId) open(note.folderId)
    requestAnimationFrame(() =>
      document
        .querySelector(`nav[aria-label="Notes"] [data-note-row="${ask.reveal}"]`)
        ?.scrollIntoView({ block: 'nearest' }),
    )
    answered()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one reveal per ask.
  }, [ask.n])

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    setDragged(null)
    if (!over) return
    const note = all.find((n) => n.id === active.id)
    const target = String(over.id).replace(/^folder:/, '')
    const folderId = target === 'none' ? null : (target as NoteFolderId)
    if (!note || note.folderId === folderId) return
    shelve.mutate({ id: note.id, folderId })
    if (folderId) open(folderId)
  }

  const onThings = allOnThings || filtering ? s.onThings : s.onThings.slice(0, ON_THINGS_SHOWN)
  // The notes as they are listed, for the one after a note deleted from the list (FR-114).
  const order = [...s.pinned, ...s.folders.flatMap((f) => f.notes), ...s.loose, ...onThings]
  const row = (n: NoteResponse) => (
    <NoteRow
      key={n.id}
      note={n}
      onDeleted={() => {
        const left = order.filter((o) => o.id !== n.id)
        const next = left[order.findIndex((o) => o.id === n.id)] ?? left.at(-1)
        navigate(next ? `/${NOTES_ID}/${next.id}` : `/${NOTES_ID}`)
      }}
    />
  )
  const newNote = (folderId: NoteFolderId) => navigate(`/${NOTES_ID}/new?folder=${folderId}`)
  const nothing =
    s.pinned.length + s.loose.length + s.onThings.length === 0 &&
    s.folders.every((f) => f.notes.length === 0)

  return (
    <>
      {(all.length > FILTER_FROM || filtering) && (
        <SidebarFilter what="notes" value={typed} onChange={setTyped} />
      )}
      <DndContext
        sensors={sensors}
        collisionDetection={pointerWithin}
        onDragStart={({ active }) => setDragged(all.find((n) => n.id === active.id) ?? null)}
        onDragCancel={() => setDragged(null)}
        onDragEnd={onDragEnd}
      >
        <nav
          aria-label="Notes"
          className="flex min-h-0 flex-1 flex-col overflow-y-auto pb-2 *:shrink-0"
        >
          {s.pinned.length > 0 && (
            <Section title="Pinned" icon={<PinIcon size={12} aria-hidden="true" />}>
              {s.pinned.map(row)}
            </Section>
          )}
          {!filtering && (
            <Section
              title="Folders"
              action={
                <button
                  type="button"
                  aria-label="New folder"
                  title="New folder"
                  onClick={() => askNewFolder()}
                  className={`${ICON_BUTTON} size-6`}
                >
                  <NewIcon size={14} aria-hidden="true" />
                </button>
              }
            >
              {s.folders.map(({ folder, notes: inside }) => (
                <FolderRow
                  key={folder.id}
                  folder={folder}
                  count={inside.length}
                  open={isOpen(folder.id)}
                  onToggle={() => toggle(folder.id)}
                  onNewNote={() => newNote(folder.id)}
                >
                  {newIn === folder.id && <Untitled />}
                  {inside.map(row)}
                </FolderRow>
              ))}
              {creating && (
                <li>
                  <RowNameField
                    label="New folder"
                    error={actions.create.isError ? problemText(actions.create.error) : null}
                    onCommit={(name) =>
                      actions.create.mutate(
                        {
                          name,
                          forNote: ask.newFolderFor === 'none' ? null : ask.newFolderFor,
                        },
                        {
                          onSuccess: (made) => {
                            open(made.id)
                            answered()
                          },
                        },
                      )
                    }
                    onCancel={() => {
                      actions.create.reset()
                      answered()
                    }}
                  />
                </li>
              )}
            </Section>
          )}
          {filtering &&
            s.folders.length > 0 &&
            s.folders.map(({ folder, notes: inside }) => (
              <Section key={folder.id} title={folder.name}>
                {inside.map(row)}
              </Section>
            ))}
          {(s.loose.length > 0 || dragged) && (
            <Loose hasFolders={s.folders.length > 0}>{s.loose.map(row)}</Loose>
          )}
          {s.onThings.length > 0 && (
            <Section title="On other things">
              {onThings.map(row)}
              {onThings.length < s.onThings.length && (
                <li>
                  <button
                    type="button"
                    onClick={() => setAllOnThings(true)}
                    className={`${NOTE_ROW({ isActive: false })} w-[calc(100%-0.75rem)] pl-8 text-muted`}
                  >
                    All {s.onThings.length} on other things
                  </button>
                </li>
              )}
            </Section>
          )}
          {filtering && nothing && <FilteredEmpty typed={typed} onClear={() => setTyped('')} />}
        </nav>
        <DragOverlay>
          {dragged && (
            <div className="flex h-7.5 cursor-grabbing items-center gap-2 rounded-control bg-float px-2 text-ui text-ink shadow-float">
              <KIND_ICON.note
                size={14}
                aria-hidden="true"
                className={`shrink-0 ${KIND_TEXT.note}`}
              />
              <span className="truncate">{noteTitle(dragged)}</span>
            </div>
          )}
        </DragOverlay>
      </DndContext>
    </>
  )
}

/** The notes in no folder; a note dropped here comes out of its folder. */
function Loose({ hasFolders, children }: { hasFolders: boolean; children: ReactNode }) {
  const drop = useDroppable({ id: dropOn(null) })
  return (
    <div ref={drop.setNodeRef} className={drop.isOver ? 'rounded-control bg-select' : ''}>
      <Section title={hasFolders ? 'Not in a folder' : 'On their own'}>{children}</Section>
    </div>
  )
}

/** The note being made in a folder, before it is written in: "Untitled", the page's own. */
function Untitled() {
  return (
    <li>
      <span aria-current="page" className={NOTE_ROW({ isActive: true })}>
        <KIND_ICON.note size={14} aria-hidden="true" className={`shrink-0 ${KIND_TEXT.note}`} />
        <span className="truncate font-normal text-muted">Untitled</span>
      </span>
    </li>
  )
}

/** One of the sidebar's places: its small heading, then its rows. */
function Section({
  title,
  icon,
  action,
  children,
}: {
  title: string
  icon?: ReactNode
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <section aria-label={title} className="pt-2">
      <h3 className="flex h-7 items-center gap-1.5 pr-2 pl-3.5 text-meta text-muted">
        {icon}
        <span className="flex-1">{title}</span>
        {action}
      </h3>
      <ul className="flex flex-col gap-px">{children}</ul>
    </section>
  )
}

/** Things' count for notes: every one, zero included. */
export function NotesCount() {
  const notes = useQuery(notesQuery())
  if (!notes.data) return null
  return <span data-count>{notes.data.length}</span>
}
