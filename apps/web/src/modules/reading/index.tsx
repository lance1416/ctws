import { topPage } from '../../shell/layout'
import type { WorkspaceModule } from '../../shell/contract'
import { useRecommendedBy } from './hooks/personThings'
import { useProjectReading } from './hooks/projectThings'
import { readingKeys } from './api'
import { UnfiledLine } from './components/ReadingKind'
import { ReadingAside, ReadingWidget } from './components/ReadingWidget'
import { useReadingCapture, useReadingEntries, useReadingHits } from './hooks/contributions'
import { ReadingFact } from './components/ReadingFact'
import { READING_ID } from './logic/id'
import { isReadingUrl } from './logic/readingUrl'
import { Reading } from './pages/Reading'

const PAGE = topPage('Reading')

export const readingModule: WorkspaceModule = {
  id: READING_ID,
  label: 'Reading',
  kind: {
    label: 'Reading',
    to: `/${READING_ID}`,
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
  creates: [
    {
      kind: 'reading',
      key: 'r',
      label: 'Reading',
      // Made from a person's page, it is what they recommended (FR-061).
      to: (about) =>
        about?.type === 'person'
          ? `/${READING_ID}?${new URLSearchParams({ recommendedBy: about.id, by: about.title })}`
          : `/${READING_ID}`,
    },
  ],
  chords: [
    {
      id: 'reading',
      key: 'r',
      label: 'Reading',
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
  // A project's page lists its reading (FR-055).
  project: { Things: { kind: 'reading', useThings: useProjectReading } },
  person: { Things: { kind: 'reading', useThings: useRecommendedBy } },
  relations: [
    {
      type: 'reading',
      kind: 'Reading',
      plural: 'Reading',
      to: (id) => `/${READING_ID}/${id}`,
      Fact: ReadingFact,
    },
  ],
  // An item names its project.
  reads: [{ queryKey: readingKeys.all, of: ['reading', 'project'] }],
}
