import { keepPreviousData, useQuery } from '@tanstack/react-query'
import type { CaptureTargetState, SearchHit } from '../../../shell/contract'
import { useRefresh } from '../../../shell/registry'
import {
  createReadingItem,
  patchReadingItem,
  readingCalendarQuery,
  readingKeys,
  readingSearchQuery,
} from '../api'
import { ReadingFact } from '../components/ReadingFact'
import { READING_ID } from '../logic/id'
import { readingLabel } from '../logic/item'

/** A pasted url lands here instead of the inbox; nothing is fetched, so it is always there. */
export function useReadingCapture(): CaptureTargetState {
  const refresh = useRefresh()
  return {
    target: {
      name: 'To read',
      to: `/${READING_ID}`,
      submit: async (line: string, { projectId, date }) => {
        const made = await createReadingItem({ kind: 'link', url: line.trim() })
        if (projectId || date)
          await patchReadingItem(made.id, {
            ...(projectId ? { projectId } : {}),
            ...(date ? { planOn: date } : {}),
          })
        // Not awaited: the capture box is free for the next line once the server has this one.
        void refresh(['reading'], [readingKeys.all])
      },
    },
  }
}

export function useReadingHits(query: string) {
  const results = useQuery({ ...readingSearchQuery(query), enabled: query.length > 0 })
  const hits: SearchHit[] = (results.data ?? []).map((item) => ({
    id: item.id,
    type: 'reading',
    // Its pane, not its url: a search result should not take the person out of the app.
    to: `/${READING_ID}/${item.id}`,
    title: readingLabel(item),
    meta: (
      <ReadingFact
        thing={{ type: 'reading', id: item.id, title: readingLabel(item), author: item.author }}
      />
    ),
    mark: null,
  }))
  return { hits, isError: results.isError, isSuccess: results.isSuccess }
}

/** Finish-by days, already in the account's zone. */
export function useReadingEntries(range: { from: string; to: string }) {
  // The month stepped away from stays drawn until the next one is in.
  const result = useQuery({ ...readingCalendarQuery(range), placeholderData: keepPreviousData })
  return { entries: result.data ?? [], isError: result.isError }
}
