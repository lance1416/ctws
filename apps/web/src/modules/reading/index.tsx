import { topPage } from '../../shell/layout'
import { ReadingNarrow } from './components/ReadingNarrow'
import { KIND_ICON } from '../../platform/ui/icons'
import type { WorkspaceModule } from '../../shell/contract'
import { useRecommendedBy } from './hooks/personThings'
import { useProjectReading } from './hooks/projectThings'
import { readingKeys } from './api'
import { UnfiledLine } from './components/ReadingKind'
import { ReadingNow } from './widgets/ReadingNow'
import { useReadingCapture, useReadingEntries, useReadingHits } from './hooks/contributions'
import { ReadingFact } from './components/ReadingFact'
import { describeReadingChange } from './logic/describeChange'
import { READING_ID } from './logic/id'
import { isReadingUrl } from './logic/readingUrl'
import { ReadingSidebar } from './components/ReadingSidebar'
import { ReadingEdit, ReadingItem } from './pages/ReadingItem'
import { ReadingOverview } from './pages/ReadingOverview'

const PAGE = topPage('Reading')

export const readingModule: WorkspaceModule = {
  id: READING_ID,
  label: 'Reading',
  kind: {
    label: 'Reading',
    to: `/${READING_ID}`,
    Status: UnfiledLine,
    List: ReadingSidebar,
    chord: 'reading',
    order: 40,
  },
  routes: [
    { index: true, element: <ReadingOverview />, handle: PAGE },
    // One item's page (FR-073), and its form.
    { path: ':id', element: <ReadingItem />, handle: PAGE },
    { path: ':id/edit', element: <ReadingEdit />, handle: PAGE },
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
  weekCounts: [
    { key: 'readingFinished', label: 'Reading finished', icon: KIND_ICON.reading, order: 50 },
  ],
  widgets: [{ place: 'reading', Component: ReadingNow }],
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
      describeChange: describeReadingChange,
      Narrow: ReadingNarrow,
      edit: (id) => `/${READING_ID}/${id}/edit`,
    },
  ],
  // An item names its project.
  reads: [{ queryKey: readingKeys.all, of: ['reading', 'project'] }],
}
