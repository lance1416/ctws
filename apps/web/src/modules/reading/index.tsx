import { kindPage } from '../../shell/layout'
import type { WorkspaceModule } from '../../shell/contract'
import { ReadingCount, UnfiledLine } from './components/ReadingKind'
import { ReadingAside, ReadingWidget } from './components/ReadingWidget'
import { useReadingCapture, useReadingEntries, useReadingHits } from './hooks/contributions'
import { READING_ID } from './logic/id'
import { isReadingUrl } from './logic/readingUrl'
import { Reading } from './pages/Reading'

// No project-page block: reading reaches a project as edges, which the shell draws for every kind.
const PAGE = kindPage('Reading')

export const readingModule: WorkspaceModule = {
  id: READING_ID,
  label: 'Reading',
  kind: {
    label: 'Reading',
    to: `/${READING_ID}`,
    Count: ReadingCount,
    Status: UnfiledLine,
    chord: 'reading',
    order: 40,
  },
  routes: [
    { index: true, element: <Reading />, handle: PAGE },
    // An item has no page of its own: this is the list with its pane open.
    { path: ':id', element: <Reading />, handle: PAGE },
  ],
  capture: { useTarget: useReadingCapture, accepts: isReadingUrl },
  search: { useHits: useReadingHits },
  // `l` for list: `r` is the task module's Review, and the keyspace is shared across modules.
  chords: [
    { id: 'reading', key: 'l', label: 'Go to Reading', resolve: () => `/${READING_ID}`, order: 15 },
  ],
  calendar: {
    label: 'Reading',
    useEntries: useReadingEntries,
    show: (e) => ({ to: `/${READING_ID}/${e.id}`, label: 'to read' }),
  },
  widgets: [
    {
      id: 'unfiled',
      label: 'Reading',
      to: `/${READING_ID}`,
      Component: ReadingWidget,
      Aside: ReadingAside,
      order: 30,
      span: 8,
    },
  ],
  relations: [{ type: 'reading', kind: 'Reading', to: (id) => `/${READING_ID}/${id}` }],
}
