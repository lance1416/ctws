import { occurrenceKey } from '@ctws/contracts'
import { useQueryClient } from '@tanstack/react-query'
import { useTimeZone } from '../../../shell/auth'
import { occurrenceQuery } from '../api'
import { ymd } from '../../../platform/time/dates'
import { useNow } from '../../../platform/time/useNow'
import { useOpenOccurrence, type OpenOccurrence } from '../hooks/useOpenOccurrence'
import { MeetingDetail } from './MeetingDetail'

/**
 * The pane of the occurrence the address names. A save that moves it renames it: what the server
 * gave back is kept as that occurrence's read, so the pane never closes while the address changes.
 */
export function OccurrencePane({ open }: { open: OpenOccurrence }) {
  const queryClient = useQueryClient()
  if (!open.found) return null
  return (
    <MeetingDetail
      key={occurrenceKey(open.found)}
      meeting={open.found}
      onClose={() => open.show(null)}
      onMoved={(moved) => {
        queryClient.setQueryData(
          occurrenceQuery(moved.meetingId, moved.recurrenceId).queryKey,
          moved,
        )
        open.show(moved, { replace: true })
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
