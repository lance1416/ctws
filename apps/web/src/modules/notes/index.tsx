import { lazyPage } from '../../platform/ui/lazyPage'
import { thingPage, topPage } from '../../shell/layout'
import { NoteNarrow } from './components/NoteNarrow'
import { KIND_ICON } from '../../platform/ui/icons'
import type { WorkspaceModule } from '../../shell/contract'
import { noteKeys } from './api'
import { NotesCount, NotesSidebar } from './components/NotesSidebar'
import { NOTES_ID } from './logic/id'
const Note = lazyPage(() => import('./pages/Note').then((m) => m.Note))
const NotesOverview = lazyPage(() => import('./pages/NotesOverview').then((m) => m.NotesOverview))

const PAGE = topPage('Notes')
/** One of them, under its kind in the breadcrumbs. */
const THING = thingPage('Notes', '/notes')

/**
 * Notes: a kind of its own, standing alone or hung on a meeting, a project, a person or an
 * organisation.
 */
export const notesModule: WorkspaceModule = {
  id: NOTES_ID,
  label: 'Notes',
  kind: {
    label: 'Notes',
    to: `/${NOTES_ID}`,
    Count: NotesCount,
    List: NotesSidebar,
    chord: 'notes',
    order: 50,
  },
  routes: [
    { index: true, element: <NotesOverview />, handle: PAGE },
    // `new` too: the note it makes keeps the editor it was typed in (see Note).
    { path: ':id', element: <Note />, handle: THING },
  ],
  creates: [
    {
      kind: 'note',
      key: 'n',
      label: 'Note',
      // From a note, the new one goes where that one is: the page reads its folder.
      to: (about) => `/${NOTES_ID}/new${about?.type === 'note' ? `?from=${about.id}` : ''}`,
    },
  ],
  chords: [{ id: 'notes', key: 'n', label: 'Notes', resolve: () => `/${NOTES_ID}`, order: 55 }],
  weekCounts: [{ key: 'meetingsWithNotes', label: 'With notes', icon: KIND_ICON.note, order: 20 }],
  relations: [
    {
      type: 'note',
      kind: 'Note',
      plural: 'Notes',
      to: (id) => `/${NOTES_ID}/${id}`,
      // Read only in the inspector; written on its page, which is its Edit.
      Narrow: NoteNarrow,
      edit: (id) => `/${NOTES_ID}/${id}`,
    },
  ],
  // What a note hangs on is named on it.
  reads: [
    {
      queryKey: noteKeys.all,
      of: ['note', 'meeting', 'project', 'person', 'organisation'],
    },
  ],
}
