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

/**
 * THE READING MODULE -- the second one, and the first real test of the seam.
 *
 * Everything below is a CONTRIBUTION, not a change to the shell: the Things row, the chord, the
 * search provider, the calendar, the Workbench card and the capture rule all arrive through the
 * contract, and the shell was not edited to make room for it. The one thing the contract gained is
 * `accepts` -- there was no way to route a captured line while only one module could take one,
 * and that is exactly the kind of gap a second module is supposed to find.
 */
const ID = 'reading'

/** Things' count for reading: what is actually waiting to be read, never the pile's size. */
function ReadingCount() {
  const items = useQuery(readingQuery())
  if (!items.data) return null
  return <span data-count>{items.data.filter(isToRead).length} to read</span>
}

/** How much of it belongs to no line of work yet: the reading that still needs a home. */
function UnfiledLine() {
  const unfiled = useQuery(readingQuery({ unfiled: true }))
  const count = unfiled.data?.filter(isToRead).length ?? 0
  return count > 0 ? <span data-status>{count} not in a project</span> : null
}

/**
 * Capture's reading half: a pasted url lands here instead of in the inbox.
 *
 * Unlike the task module's, this target needs nothing fetched -- the destination is the list
 * itself -- so it is never missing and never unavailable.
 */
function useReadingCapture(): CaptureTargetState {
  const qc = useQueryClient()
  return {
    target: {
      name: 'Reading',
      to: `/${ID}`,
      submit: async (line: string) => {
        await createReadingItem({ kind: 'link', url: line.trim() })
        // Awaited, so the capture box stays busy until the list that now holds the line is fresh.
        await refreshQueries(qc, [['reading']])
      },
    },
    missing: false,
    unavailable: false,
  }
}

/** This module's half of federated search: titles, authors and hosts. */
function useReadingHits(query: string) {
  const results = useQuery({ ...readingSearchQuery(query), enabled: query.length > 0 })
  const hits: SearchHit[] = (results.data ?? []).map((item) => ({
    id: item.id,
    // Its pane, not its url: a search result goes somewhere in this app, and an external link
    // from a search dialog would take the person out of the workspace mid-search.
    to: `/${ID}/${item.id}`,
    title: readingLabel(item),
    meta: [item.projectName, item.kind === 'book' ? 'Book' : 'Link'].filter(Boolean).join(' · '),
    mark: null,
  }))
  return { hits, isError: results.isError, isSuccess: results.isSuccess }
}

/** This module's dated things: when to finish one, already a day in the account's zone. */
function useReadingEntries(range: { from: string; to: string }) {
  const result = useQuery(readingCalendarQuery(range))
  return { entries: result.data ?? [], isError: result.isError }
}

/**
 * THE WORKBENCH CARD: what belongs to NO project.
 *
 * Deliberately not the whole list. Anything filed under a project is on that project's page, and
 * a card that repeated it would make two places to keep in your head. What is left is exactly
 * what has nowhere else to appear: a book, a link you saved on the way past.
 */
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
      {/* A glance, not a list: five rows, and the heading for the rest. A card that grows without
          bound stops being a card and starts being a second copy of the page. */}
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

/** The Reading card's note: how much is waiting to be read, filed or not. */
function ReadingAside() {
  const all = useQuery(readingQuery())
  if (!all.data) return null
  return <span className="text-sm text-ink-subtle">{all.data.filter(isToRead).length} to read</span>
}

/** How many rows a workbench card shows before it defers to its page. */
const WIDGET_ROWS = 5

/**
 * NO BLOCK ON A PROJECT PAGE.
 *
 * This module's rows reach a project as edges, and the shell draws every kind of edge the same way.
 * One of these is made on its own page and filed there, or dropped into the capture box, never from
 * a project page.
 */

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
  // `l` for list. `r` is the task module's Review and one keyspace is shared across modules, so a
  // second module cannot take a key that is already spoken for.
  chords: [{ id: 'reading', key: 'l', label: 'Go to Reading', resolve: () => `/${ID}`, order: 15 }],
  calendar: { label: 'Reading', useEntries: useReadingEntries },
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
  // No page of its own: a thing to read is a title, a link and a status, and a page per item
  // would be a page holding one line. The list IS where one is read.
  relations: [{ type: 'reading', kind: 'Reading', to: (id) => `/${ID}/${id}` }],
}
