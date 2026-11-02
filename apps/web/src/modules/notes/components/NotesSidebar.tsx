import type { NoteFolderId, NoteFolderResponse, NoteResponse } from '@ctws/contracts'
import { FOLDER_DEPTH, mayGoInto } from '@ctws/core'
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
import { CollapseIcon, KIND_ICON, NewIcon, PinIcon } from '../../../platform/ui/icons'
import { KIND_TEXT } from '../../../platform/ui/kinds'
import { FILTER_FROM, FilteredEmpty, SidebarFilter } from '../../../shell/layout'
import { foldersQuery, notesQuery } from '../api'
import { answered, askNewFolder, useSidebarAsk } from '../hooks/sidebarAsk'
import { useFolderActions } from '../hooks/useFolderActions'
import { useShelveNote } from '../hooks/useShelveNote'
import { NOTES_ID } from '../logic/id'
import { deleteQuestion } from '../logic/folderDelete'
import { everyShelf, type Shelf, shelvesOf } from '../logic/shelves'
import { noteTitle } from '../logic/title'
import { RowNameField } from './RowNameField'
import { dragOf, dropOn, FolderRow } from './FolderRow'
import { NOTE_ROW, NoteRow } from './NoteRow'

/** How many notes on other things are listed before their "All N". */
const ON_THINGS_SHOWN = 5

/** How long a dragged row rests on a closed folder before it opens to take it in. */
const OPEN_AFTER_MS = 600

/** What is being dragged: a note on its own, or a folder with all it holds. */
type Dragged = { note: NoteResponse } | { folder: NoteFolderResponse }

/**
 * THE NOTES SIDEBAR (REQ-002 FR-110, FR-117, artboards 34 and 40): the pinned, then the folders
 * as a tree three deep, each opened or closed as it was left, then the notes in none, then those
 * on other things, the first few and their "All N". Every folder over the note on the page is
 * open. A note on its own, or a folder, is dragged onto a folder to go in, onto Not in a folder to
 * come out; a folder only where it and all it holds stay three deep. Move to a folder does the
 * same by keys.
 */
export function NotesSidebar() {
  const notes = useQuery(notesQuery())
  const folders = useQuery(foldersQuery())
  const actions = useFolderActions()
  const shelve = useShelveNote()
  const ask = useSidebarAsk()
  const [typed, setTyped] = useState('')
  // Opened or closed here and now, over what the account keeps: the chain over the open note
  // opens itself, and a hand that closes one of its folders is listened to.
  const [opened, setOpened] = useState<ReadonlySet<NoteFolderId>>(new Set())
  const [closed, setClosed] = useState<ReadonlySet<NoteFolderId>>(new Set())
  const [allOnThings, setAllOnThings] = useState(false)
  const [dragged, setDragged] = useState<Dragged | null>(null)
  const [refused, setRefused] = useState(false)
  const [overId, setOverId] = useState<string | null>(null)
  // A folder being made inside another, in its own row at the top of it.
  const [newFolderIn, setNewFolderIn] = useState<NoteFolderId | null>(null)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))
  const here = useMatch(`/${NOTES_ID}/:id`)?.params.id
  const navigate = useNavigate()
  // A note being made in a folder (FR-115): it sits at the top of it until it is written in.
  const [search] = useSearchParams()
  const newIn = here === 'new' ? (search.get('folder') as NoteFolderId | null) : null
  const all = notes.data ?? []
  const fs = folders.data ?? []
  const filtering = typed.trim() !== ''
  const s = shelvesOf(all, fs, typed)
  const current = all.find((n) => n.id === here)
  const parentOf = new Map(fs.map((f) => [f.id, f.parentId]))
  const chain = (id: NoteFolderId | null | undefined): NoteFolderId[] => {
    const out: NoteFolderId[] = []
    for (let at = id ?? null; at; at = parentOf.get(at) ?? null) out.push(at)
    return out
  }
  const auto = new Set([...chain(current?.folderId), ...chain(newIn), ...chain(newFolderIn)])
  const isOpen = (id: NoteFolderId) =>
    filtering ||
    (!closed.has(id) && (opened.has(id) || auto.has(id) || !!fs.find((f) => f.id === id)?.open))
  /** `id` and every folder over it opened, and kept open with the account. */
  const open = (id: NoteFolderId) => {
    const ids = chain(id)
    setOpened((was) => new Set([...was, ...ids]))
    setClosed((was) => new Set([...was].filter((c) => !ids.includes(c))))
    for (const at of ids)
      if (!fs.find((f) => f.id === at)?.open) actions.open.mutate({ id: at, open: true })
  }
  const toggle = (id: NoteFolderId) => {
    if (!isOpen(id)) return open(id)
    setOpened((was) => new Set([...was].filter((o) => o !== id)))
    setClosed((was) => new Set([...was, id]))
    actions.open.mutate({ id, open: false })
  }
  const creating = ask.newFolderFor !== null
  const draggedFolder = dragged && 'folder' in dragged ? dragged.folder : null
  const refuses = (target: NoteFolderId) =>
    draggedFolder !== null && !mayGoInto(fs, draggedFolder.id, target)

  // The head's folder tag: that folder and those over it opened, the note's row brought into view.
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

  // A row held over a closed folder opens it, so it can go further in.
  useEffect(() => {
    const target = overId?.startsWith('folder:') ? overId.slice(7) : null
    if (!target || target === 'none' || isOpen(target as NoteFolderId)) return
    const t = setTimeout(() => open(target as NoteFolderId), OPEN_AFTER_MS)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- a rest on one folder.
  }, [overId])

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    const was = dragged
    setDragged(null)
    setOverId(null)
    setRefused(false)
    if (!over || !was) return
    const target = String(over.id).replace(/^folder:/, '')
    const into = target === 'none' ? null : (target as NoteFolderId)
    if ('note' in was) {
      if (was.note.folderId === into) return
      shelve.mutate({ id: was.note.id, folderId: into })
    } else {
      if (was.folder.parentId === into || (into && !mayGoInto(fs, was.folder.id, into))) return
      actions.move.mutate({ id: was.folder.id, parentId: into })
    }
    if (into) open(into)
    void active
  }

  const onThings = allOnThings || filtering ? s.onThings : s.onThings.slice(0, ON_THINGS_SHOWN)
  const shelves = everyShelf(s.folders)
  // The notes as they are listed, for the one after a note deleted from the list (FR-114).
  const order = [...s.pinned, ...shelves.flatMap((f) => f.notes), ...s.loose, ...onThings]
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
    shelves.every((f) => f.notes.length === 0)

  const branch = (shelf: Shelf, depth: number): ReactNode => {
    const { folder } = shelf
    return (
      <FolderRow
        key={folder.id}
        folder={folder}
        count={shelf.count}
        open={isOpen(folder.id)}
        onToggle={() => toggle(folder.id)}
        onNewNote={() => newNote(folder.id)}
        onNewFolder={
          depth < FOLDER_DEPTH
            ? () => {
                setNewFolderIn(folder.id)
                open(folder.id)
              }
            : null
        }
        asked={deleteQuestion(folder, fs, all)}
        refuses={refuses(folder.id)}
      >
        {newFolderIn === folder.id && (
          <li>
            <RowNameField
              label={`New folder in ${folder.name}`}
              error={actions.create.isError ? problemText(actions.create.error) : null}
              onCommit={(name) =>
                actions.create.mutate(
                  { name, parentId: folder.id, forNote: null },
                  { onSuccess: () => setNewFolderIn(null) },
                )
              }
              onCancel={() => {
                actions.create.reset()
                setNewFolderIn(null)
              }}
            />
          </li>
        )}
        {newIn === folder.id && <Untitled />}
        {shelf.folders.map((f) => branch(f, depth + 1))}
        {shelf.notes.map(row)}
      </FolderRow>
    )
  }

  return (
    <>
      {(all.length > FILTER_FROM || filtering) && (
        <SidebarFilter what="notes" value={typed} onChange={setTyped} />
      )}
      <DndContext
        sensors={sensors}
        collisionDetection={pointerWithin}
        onDragStart={({ active }) => {
          const id = String(active.id)
          const folder = id.startsWith('move:') ? fs.find((f) => dragOf(f) === id) : null
          const note = all.find((n) => n.id === id)
          setDragged(folder ? { folder } : note ? { note } : null)
        }}
        onDragMove={({ activatorEvent, delta }) => {
          // Over a folder it may not go into: no row lights, and it says why.
          if (!draggedFolder || !(activatorEvent instanceof PointerEvent)) return
          // Under the row being carried, which covers the point itself.
          const target = document
            .elementsFromPoint(activatorEvent.clientX + delta.x, activatorEvent.clientY + delta.y)
            .map((el) => el.closest<HTMLElement>('[data-folder-row]')?.dataset.folderRow)
            .find((id) => id !== undefined)
          setRefused(!!target && refuses(target as NoteFolderId))
        }}
        onDragOver={({ over }) => setOverId(over ? String(over.id) : null)}
        onDragCancel={() => {
          setDragged(null)
          setOverId(null)
          setRefused(false)
        }}
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
              {s.folders.map((shelf) => branch(shelf, 1))}
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
            shelves
              .filter((f) => f.notes.length > 0)
              .map(({ folder, notes: inside }) => (
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
            <div className={refused ? 'cursor-not-allowed' : 'cursor-grabbing'}>
              <div className="flex h-7.5 items-center gap-2 rounded-control bg-float px-2 text-ui text-ink shadow-float">
                {'note' in dragged ? (
                  <>
                    <KIND_ICON.note
                      size={14}
                      aria-hidden="true"
                      className={`shrink-0 ${KIND_TEXT.note}`}
                    />
                    <span className="truncate">{noteTitle(dragged.note)}</span>
                  </>
                ) : (
                  <>
                    <CollapseIcon size={14} aria-hidden="true" className="shrink-0 text-muted" />
                    <span className="truncate">{dragged.folder.name}</span>
                  </>
                )}
              </div>
              {refused && (
                <p
                  role="status"
                  className="mt-1 w-fit rounded-control bg-ink px-2 py-1 text-meta text-ground"
                >
                  Folders go three deep
                </p>
              )}
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
