import { isReadingUrl } from '../logic/readingUrl'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import type { CaptureTargetState } from '../../../shell/contract'
import { useRefresh } from '../../../shell/registry'
import { createReadingItem, patchReadingItem, readingCalendarQuery, readingKeys } from '../api'
import { READING_ID } from '../logic/id'

/** A pasted url lands here instead of the inbox; nothing is fetched, so it is always there. */
export function useReadingCapture(): CaptureTargetState {
  const refresh = useRefresh()
  return {
    target: {
      name: 'To read',
      to: `/${READING_ID}`,
      submit: async (line: string, { projectId, date }) => {
        // A link is a link; anything else typed with Reading chosen is a book's title (FR-072).
        const text = line.trim()
        const made = await createReadingItem(
          isReadingUrl(text) ? { kind: 'link', url: text } : { kind: 'book', title: text },
        )
        if (projectId || date)
          await patchReadingItem(made.id, {
            ...(projectId ? { projectId } : {}),
            ...(date ? { planOn: date } : {}),
          })
        // Not awaited: the capture box is free for the next line once the server has this one.
        void refresh(['reading'], [readingKeys.all])
        return `/${READING_ID}/${made.id}`
      },
    },
  }
}

/** Finish-by days, already in the account's zone. */
export function useReadingEntries(range: { from: string; to: string }) {
  // The month stepped away from stays drawn until the next one is in.
  const result = useQuery({ ...readingCalendarQuery(range), placeholderData: keepPreviousData })
  return {
    entries: result.data ?? [],
    isError: result.isError,
    retry: () => void result.refetch(),
  }
}
