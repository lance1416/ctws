import { topPage } from '../../shell/layout'
import type { WorkspaceModule } from '../../shell/contract'
import { readingKeys } from './api'
import { ReadingCount, UnfiledLine } from './components/ReadingKind'
import { ReadingAside, ReadingWidget } from './components/ReadingWidget'
import { useReadingCapture, useReadingEntries, useReadingHits } from './hooks/contributions'
import { READING_ID } from './logic/id'
import { isReadingUrl } from './logic/readingUrl'
import { Reading } from './pages/Reading'

// No project-page block: reading reaches a project as edges, which the shell draws for every kind.
const PAGE = topPage('Reading')

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
  capture: { kind: 'reading', useTarget: useReadingCapture, accepts: isReadingUrl },
  search: { useHits: useReadingHits },
  chords: [
    {
      id: 'reading',
      key: 'r',
      label: 'Go to Reading',
      resolve: () => `/${READING_ID}`,
      order: 50,
      was: 'g l',
    },
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
  relations: [
    {
      type: 'reading',
      kind: 'Reading',
      plural: 'Reading',
      to: (id) => `/${READING_ID}/${id}`,
      describe: (t) => (t.type === 'reading' ? t.author : null),
    },
  ],
  // An item names its project.
  reads: [{ queryKey: readingKeys.all, of: ['reading', 'project'] }],
}
