import { useQuery, useQueryClient } from '@tanstack/react-query'
import { refreshQueries } from '../../../platform/http/refresh'
import type { CaptureTargetState, SearchHit } from '../../../shell/contract'
import { createReadingItem, readingCalendarQuery, readingSearchQuery } from '../api'
import { READING_ID } from '../logic/id'
import { readingLabel } from '../logic/item'

/** A pasted url lands here instead of the inbox; nothing is fetched, so it is always there. */
export function useReadingCapture(): CaptureTargetState {
  const qc = useQueryClient()
  return {
    target: {
      name: 'Reading',
      to: `/${READING_ID}`,
      submit: async (line: string) => {
        await createReadingItem({ kind: 'link', url: line.trim() })
        // Not awaited: the capture box is free for the next line once the server has this one.
        void refreshQueries(qc, [['reading']])
      },
    },
  }
}

export function useReadingHits(query: string) {
  const results = useQuery({ ...readingSearchQuery(query), enabled: query.length > 0 })
  const hits: SearchHit[] = (results.data ?? []).map((item) => ({
    id: item.id,
    // Its pane, not its url: a search result should not take the person out of the app.
    to: `/${READING_ID}/${item.id}`,
    title: readingLabel(item),
    meta: [item.projectName, item.kind === 'book' ? 'Book' : 'Link'].filter(Boolean).join(' · '),
    mark: null,
  }))
  return { hits, isError: results.isError, isSuccess: results.isSuccess }
}

/** Finish-by days, already in the account's zone. */
export function useReadingEntries(range: { from: string; to: string }) {
  const result = useQuery(readingCalendarQuery(range))
  return { entries: result.data ?? [], isError: result.isError }
}
