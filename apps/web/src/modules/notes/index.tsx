import { topPage } from '../../shell/layout'
import type { WorkspaceModule } from '../../shell/contract'
import { noteKeys } from './api'
import { NotesCount, NotesSidebar } from './components/NotesSidebar'
import { NOTES_ID } from './logic/id'
import { Note } from './pages/Note'
import { NotesOverview } from './pages/NotesOverview'

const PAGE = topPage('Notes')

/**
 * Notes (FR-050, FR-074): a kind of its own, standing alone or hung on a meeting, a project, a
 * person or an organisation, in the Markdown editor the app has today. Folders, pinning and the
 * new editor come with the Notes batch (FR-103).
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
    { path: ':id', element: <Note />, handle: PAGE },
  ],
  creates: [{ kind: 'note', key: 'n', label: 'Note', to: `/${NOTES_ID}/new` }],
  chords: [{ id: 'notes', key: 'n', label: 'Notes', resolve: () => `/${NOTES_ID}`, order: 55 }],
  relations: [{ type: 'note', kind: 'Note', plural: 'Notes', to: (id) => `/${NOTES_ID}/${id}` }],
  // What a note hangs on is named on it.
  reads: [
    {
      queryKey: noteKeys.all,
      of: ['note', 'meeting', 'project', 'person', 'organisation'],
    },
  ],
}
