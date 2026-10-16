import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createReadingItem, readingCalendarQuery, readingQuery, readingSearchQuery } from './api'
import { isToRead, readingLabel } from './item'
import { hostOf, KindGlyph } from './marks'
import { Link } from 'react-router-dom'
import { refreshQueries } from '../../platform/http/refresh'
import { PanelEmpty } from '../../platform/ui/Panel'
import { ProjectRail } from '../../shell/rows/RowParts'
import { isReadingUrl } from './readingUrl'
import { Reading } from './pages/Reading'
import type { CaptureTargetState, SearchHit, WorkspaceModule } from '../../shell/contract'

const ID = 'reading'

/** "4 to read", for Things' count and the Workbench card's corner; null until loaded. */
function useToReadCount(): string | null {
  const items = useQuery(readingQuery())
  return items.data ? `${items.data.filter(isToRead).length} to read` : null
}

function ReadingCount() {
  const count = useToReadCount()
  return count && <span data-count>{count}</span>
}

function UnfiledLine() {
  const unfiled = useQuery(readingQuery({ unfiled: true }))
  const count = unfiled.data?.filter(isToRead).length ?? 0
  return count > 0 ? <span data-status>{count} not in a project</span> : null
}

/** A pasted url lands here instead of the inbox; nothing is fetched, so it is always there. */
function useReadingCapture(): CaptureTargetState {
  const qc = useQueryClient()
  return {
    target: {
      name: 'Reading',
      to: `/${ID}`,
      submit: async (line: string) => {
        await createReadingItem({ kind: 'link', url: line.trim() })
        // Not awaited: the capture box is free for the next line once the server has this one.
        void refreshQueries(qc, [['reading']])
      },
    },
  }
}

function useReadingHits(query: string) {
  const results = useQuery({ ...readingSearchQuery(query), enabled: query.length > 0 })
  const hits: SearchHit[] = (results.data ?? []).map((item) => ({
    id: item.id,
    // Its pane, not its url: a search result should not take the person out of the app.
    to: `/${ID}/${item.id}`,
    title: readingLabel(item),
    meta: [item.projectName, item.kind === 'book' ? 'Book' : 'Link'].filter(Boolean).join(' · '),
    mark: null,
  }))
  return { hits, isError: results.isError, isSuccess: results.isSuccess }
}

/** Finish-by days, already in the account's zone. */
function useReadingEntries(range: { from: string; to: string }) {
  const result = useQuery(readingCalendarQuery(range))
  return { entries: result.data ?? [], isError: result.isError }
}

/** The Workbench card: reading in no project, since anything filed shows on its project's page. */
function ReadingWidget() {
  const items = useQuery(readingQuery({ unfiled: true }))
  const rows = (items.data ?? []).filter(isToRead)

  if (items.isError) {
    return (
      <p role="alert" className="px-2 py-1.5 text-sm text-danger">
        Couldn't load the reading list
      </p>
    )
  }
  if (items.isSuccess && rows.length === 0) return <PanelEmpty>Nothing unfiled</PanelEmpty>
  return (
    <ul className="min-w-0">
      {rows.slice(0, WIDGET_ROWS).map((item) => (
        <li key={item.id}>
          <Link
            to={`/${ID}/${item.id}`}
            className="flex min-h-[42px] min-w-0 items-stretch gap-2.5 hover:bg-hover"
          >
            <ProjectRail projectId={item.projectId} />
            <span className="flex shrink-0 items-center text-ink-muted">
              <KindGlyph kind={item.kind} />
            </span>
            <span className="flex min-w-0 flex-1 items-baseline gap-3 self-center">
              <span className="min-w-0 truncate text-ink">{readingLabel(item)}</span>
              <span className="ml-auto min-w-0 shrink truncate text-sm text-ink-subtle">
                {item.kind === 'book' ? (item.author ?? '') : (hostOf(item.url) ?? '')}
              </span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  )
}

function ReadingAside() {
  const count = useToReadCount()
  return count && <span className="text-sm text-ink-subtle">{count}</span>
}

/** How many rows a workbench card shows before it defers to its page. */
const WIDGET_ROWS = 5

// No project-page block: reading reaches a project as edges, which the shell draws for every kind.
export const readingModule: WorkspaceModule = {
  id: ID,
  label: 'Reading',
  kind: {
    label: 'Reading',
    to: `/${ID}`,
    Count: ReadingCount,
    Status: UnfiledLine,
    chord: 'reading',
    order: 40,
  },
  routes: [
    { index: true, element: <Reading /> },
    // An item has no page of its own: this is the list with its pane open.
    { path: ':id', element: <Reading /> },
  ],
  capture: { useTarget: useReadingCapture, accepts: isReadingUrl },
  search: { useHits: useReadingHits },
  // `l` for list: `r` is the task module's Review, and the keyspace is shared across modules.
  chords: [{ id: 'reading', key: 'l', label: 'Go to Reading', resolve: () => `/${ID}`, order: 15 }],
  calendar: {
    label: 'Reading',
    useEntries: useReadingEntries,
    show: () => ({ to: '/reading', label: 'to read' }),
  },
  widgets: [
    {
      id: 'unfiled',
      label: 'Reading',
      to: `/${ID}`,
      Component: ReadingWidget,
      Aside: ReadingAside,
      order: 30,
      span: 8,
    },
  ],
  relations: [{ type: 'reading', kind: 'Reading', to: (id) => `/${ID}/${id}` }],
}
