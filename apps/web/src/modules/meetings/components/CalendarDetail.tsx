import {
  idFrom,
  meetingId as meetingIdSchema,
  type MeetingOccurrence,
  occurrenceKey,
} from '@ctws/contracts'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import type { ShownEntry } from '../../../shell/contract'
import { useTimeZone } from '../../../shell/auth'
import { occurrenceQuery } from '../api'
import { MeetingDetail } from './MeetingDetail'

/**
 * The pane for a clicked calendar entry, which names one occurrence of a series. A save that
 * moves it renames it, so the pane follows the name the server gives back, keeping the last one
 * on screen while it reads the new.
 */
export function CalendarDetail({ entry, onClose }: { entry: ShownEntry; onClose: () => void }) {
  const accountZone = useTimeZone()
  const [moved, setMoved] = useState<{ from: string; to: MeetingOccurrence } | null>(null)
  const { meetingId, recurrenceId } =
    moved?.from === entry.key
      ? moved.to
      : { meetingId: idFrom(meetingIdSchema, entry.id), recurrenceId: entry.recurrenceId ?? '' }
  const found = useQuery({
    ...occurrenceQuery(meetingId, recurrenceId),
    placeholderData: keepPreviousData,
  })
  if (!found.data) return null
  return (
    <MeetingDetail
      key={occurrenceKey(found.data)}
      meeting={found.data}
      accountZone={accountZone}
      onClose={onClose}
      onMoved={(to) => setMoved({ from: entry.key, to })}
    />
  )
}
