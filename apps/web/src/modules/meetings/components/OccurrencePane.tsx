import { occurrenceKey, type MeetingOccurrence } from '@ctws/contracts'
import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useTimeZone } from '../../../shell/auth'
import { occurrenceQuery } from '../api'
import { ymd } from '../../../platform/time/dates'
import { useNow } from '../../../platform/time/useNow'
import { useOpenOccurrence, type OpenOccurrence } from '../hooks/useOpenOccurrence'
import { MeetingDetail } from './MeetingDetail'

/**
 * The pane of the occurrence the address names. A save that moves it renames it: what the server
 * gave back is kept as that occurrence's read, so the pane never closes while the address changes.
 * Until the address has followed, the old name reads as gone, so the pane shows where it went; and
 * it keeps the key it had, so it is the same pane under its new name rather than a new one opening.
 */
function OccurrencePane({ open }: { open: OpenOccurrence }) {
  const queryClient = useQueryClient()
  /** The last move made here: the pane's key, the address it was at, and where it went. */
  const [moved, setMoved] = useState<{ key: string; at: string; to: MeetingOccurrence } | null>(
    null,
  )
  const address = open.named ? `${open.named.meetingId}:${open.named.at}` : null
  const meeting = open.found ?? (moved && address === moved.at ? moved.to : null)
  if (!meeting) return null
  const named = occurrenceKey(meeting)
  const key = moved && occurrenceKey(moved.to) === named ? moved.key : named
  return (
    <MeetingDetail
      key={key}
      meeting={meeting}
      onClose={() => open.show(null)}
      onMoved={(next) => {
        queryClient.setQueryData(occurrenceQuery(next.meetingId, next.recurrenceId).queryKey, next)
        if (address) setMoved({ key, at: address, to: next })
        open.show(next, { replace: true })
      }}
    />
  )
}

/** The pane over the Calendar, which lists entries, not occurrences: each is read on its own. */
export function CalendarOccurrence() {
  const today = ymd(useNow(), useTimeZone())
  const open = useOpenOccurrence({ where: 'over', listed: () => undefined, ready: true, today })
  return <OccurrencePane open={open} />
}
