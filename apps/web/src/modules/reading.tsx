import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createReadingItem, listReading, readingLabel, searchReading } from '../api/reading'
import { AddReading } from '../components/AddReading'
import { ReadingRow } from '../components/ReadingRow'
import { Stat, StatRow } from '../components/Stat'
import { isReadingUrl } from '../readingUrl'
import { Reading } from '../routes/Reading'
import { useTimeZone } from '../useMe'
import type { CaptureTargetState, SearchHit, WorkspaceModule } from './contract'

/**
 * THE READING MODULE -- the second one, and the first real test of the seam.
 *
 * Everything below is a CONTRIBUTION, not a change to the shell: the rail row, the chord, the
 * search provider, the project block and the capture rule all arrive through the contract, and
 * the shell was not edited to make room for 待读. The one thing the contract gained is
 * `accepts` -- there was no way to route a captured line while only one module could take one,
 * and that is exactly the kind of gap a second module is supposed to find.
 */
const ID = 'reading'

/** The whole list, in one cache entry the page and the rail share. */
const useAll = () => useQuery({ queryKey: ['reading', null, null], queryFn: () => listReading() })

/** The rail's count: what is actually waiting to be read, never the pile's total size. */
function ReadingCount() {
  const items = useAll()
  const count = items.data?.filter((i) => i.status === 'todo' || i.status === 'reading').length ?? 0
  if (count <= 0) return null
  return (
    <span data-count className="ml-auto pl-1 text-xs text-fg-muted">
      {count}
    </span>
  )
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
      name: '待读',
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
    meta: [item.projectName, item.kind === 'book' ? '书' : '链接'].filter(Boolean).join(' · '),
    mark: null,
  }))
  return { hits, isError: results.isError, isSuccess: results.isSuccess }
}

/** This module's rows under a shell project: an article about CTWS belongs to CTWS. */
function ReadingProjectView({ projectId }: { projectId: string }) {
  const items = useQuery({
    queryKey: ['reading', projectId, null],
    queryFn: () => listReading({ projectId }),
  })
  const timeZone = useTimeZone()
  const rows = (items.data ?? []).filter((i) => i.status === 'todo' || i.status === 'reading')

  return (
    <div>
      <AddReading projectId={projectId} />
      {rows.length === 0 ? (
        <p className="mt-2 text-sm text-fg-subtle">还没有要读的</p>
      ) : (
        <ul className="mt-1">
          {rows.map((item) => (
            <ReadingRow key={item.id} item={item} timeZone={timeZone} />
          ))}
        </ul>
      )}
    </div>
  )
}

/** This module's numbers in the project banner, beside the task module's. */
function ReadingHeadline({ projectId }: { projectId: string }) {
  const items = useQuery({
    queryKey: ['reading', projectId, null],
    queryFn: () => listReading({ projectId }),
  })
  const rows = items.data ?? []
  if (rows.length === 0) return null
  const open = rows.filter((i) => i.status === 'todo' || i.status === 'reading').length
  return (
    <StatRow>
      <Stat label="待读" value={String(open)} />
    </StatRow>
  )
}

export const readingModule: WorkspaceModule = {
  id: ID,
  label: '待读',
  destinations: [{ id: 'list', to: `/${ID}`, label: '待读', Count: ReadingCount }],
  routes: [{ index: true, element: <Reading /> }],
  capture: { useTarget: useReadingCapture, accepts: isReadingUrl },
  search: { useHits: useReadingHits },
  // `l` for list. `r` is the task module's 回顾 and one keyspace is shared across modules, so a
  // second module cannot take a key that is already spoken for.
  chords: [{ id: 'reading', key: 'l', label: '去「待读」', resolve: () => `/${ID}`, order: 15 }],
  ProjectView: ReadingProjectView,
  ProjectHeadline: ReadingHeadline,
}
