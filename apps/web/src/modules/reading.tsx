import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  createReadingItem,
  listReading,
  readingCalendar,
  readingKey,
  readingLabel,
  searchReading,
} from '../api/reading'
import { Link } from 'react-router-dom'
import { PanelEmpty } from '../components/Panel'
import { ProjectRail } from '../components/RowParts'
import { Stat, StatRow } from '../components/Stat'
import { isReadingUrl } from '../readingUrl'
import { Reading } from '../routes/Reading'
import type { CaptureTargetState, SearchHit, WorkspaceModule } from './contract'

/**
 * THE READING MODULE -- the second one, and the first real test of the seam.
 *
 * Everything below is a CONTRIBUTION, not a change to the shell: the Things row, the chord, the
 * search provider, the project block and the capture rule all arrive through the contract, and
 * the shell was not edited to make room for it. The one thing the contract gained is
 * `accepts` -- there was no way to route a captured line while only one module could take one,
 * and that is exactly the kind of gap a second module is supposed to find.
 */
const ID = 'reading'

/** The whole list, in one cache entry the page and its Things row share. */
const useAll = () => useQuery({ queryKey: readingKey(), queryFn: () => listReading() })

/** Things' count for reading: what is actually waiting to be read, never the pile's size. */
function ReadingCount() {
  const items = useAll()
  if (!items.data) return null
  const count = items.data.filter((i) => i.status === 'todo' || i.status === 'reading').length
  return <span data-count>{count} to read</span>
}

/** How much of it belongs to no line of work yet: the reading that still needs a home. */
function UnfiledLine() {
  const unfiled = useQuery({
    queryKey: readingKey({ unfiled: true }),
    queryFn: () => listReading({ unfiled: true }),
  })
  const count =
    unfiled.data?.filter((i) => i.status === 'todo' || i.status === 'reading').length ?? 0
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
        await qc.invalidateQueries({ queryKey: ['reading'] })
      },
    },
    missing: false,
    unavailable: false,
  }
}

/** This module's half of federated search: titles, authors and hosts. */
function useReadingHits(query: string) {
  const results = useQuery({
    queryKey: ['reading-search', query],
    queryFn: () => searchReading(query),
    enabled: query.length > 0,
  })
  const hits: SearchHit[] = (results.data ?? []).map((item) => ({
    id: item.id,
    // The list, not the url: a search result goes somewhere in this app, and an external link
    // from a search dialog would take the person out of the workspace mid-search.
    to: `/${ID}`,
    title: readingLabel(item),
    meta: [item.projectName, item.kind === 'book' ? 'Book' : 'Link'].filter(Boolean).join(' · '),
    mark: null,
  }))
  return { hits, isError: results.isError, isSuccess: results.isSuccess }
}

/** This module's dated things: when to finish one, already a day in the account's zone. */
function useReadingEntries(range: { from: string; to: string }) {
  const result = useQuery({
    queryKey: ['reading-calendar', range.from, range.to],
    queryFn: () => readingCalendar(range),
  })
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
  const items = useQuery({
    queryKey: readingKey({ unfiled: true }),
    queryFn: () => listReading({ unfiled: true }),
  })
  const rows = (items.data ?? []).filter((i) => i.status === 'todo' || i.status === 'reading')

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
              {item.kind === 'book' ? <BookGlyph /> : <LinkGlyph />}
            </span>
            <span className="flex min-w-0 flex-1 items-baseline gap-3 self-center">
              <span className="min-w-0 truncate text-ink">{readingLabel(item)}</span>
              <span className="ml-auto min-w-0 shrink truncate text-sm text-ink-subtle">
                {item.kind === 'book' ? (item.author ?? '') : hostOf(item.url)}
              </span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  )
}

/** Where a link is from, as a person says it: `w3.org`, not the whole URL. */
function hostOf(url: string | null): string {
  if (!url) return ''
  try {
    return new URL(url).host.replace(/^www\./, '')
  } catch {
    return ''
  }
}

function BookGlyph() {
  return (
    <svg
      role="img"
      aria-label="Book"
      width="18"
      height="18"
      viewBox="0 0 18 18"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinejoin="round"
    >
      <path d="M3.5 3.5h4.2c.9 0 1.3.5 1.3 1.3v9.7c0-.8-.6-1.3-1.4-1.3H3.5zM14.5 3.5h-4.2c-.9 0-1.3.5-1.3 1.3v9.7c0-.8.6-1.3 1.4-1.3h4.1z" />
    </svg>
  )
}

function LinkGlyph() {
  return (
    <svg
      role="img"
      aria-label="Link"
      width="18"
      height="18"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
    >
      <path d="M8.6 11.4l2.8-2.8M7.4 9.2L5.8 10.8a2.4 2.4 0 0 0 3.4 3.4l1.6-1.6M12.6 10.8l1.6-1.6a2.4 2.4 0 0 0-3.4-3.4L9.2 7.4" />
    </svg>
  )
}

/** The Reading card's note: how much is waiting to be read, filed or not. */
function ReadingAside() {
  const all = useAll()
  if (!all.data) return null
  const n = all.data.filter((i) => i.status === 'todo' || i.status === 'reading').length
  return <span className="text-sm text-ink-subtle">{n} to read</span>
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

/** This module's numbers in the project banner, beside the task module's. */
function ReadingHeadline({ projectId }: { projectId: string }) {
  const items = useQuery({
    queryKey: readingKey({ projectId }),
    queryFn: () => listReading({ projectId }),
  })
  const rows = items.data ?? []
  if (rows.length === 0) return null
  const open = rows.filter((i) => i.status === 'todo' || i.status === 'reading').length
  return (
    <StatRow>
      <Stat label="Reading" value={String(open)} />
    </StatRow>
  )
}

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
    // 一条读物没有自己的页：这条路渲染的是列表加它的那一层。
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
  ProjectHeadline: ReadingHeadline,
  // No page of its own: a thing to read is a title, a link and a status, and a page per item
  // would be a page holding one line. The list IS where one is read.
  relations: [{ type: 'reading', kind: 'Reading', to: (id) => `/${ID}/${id}` }],
}
