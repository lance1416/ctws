import type { MeetingOccurrence } from '@ctws/contracts'
import { addDays } from '@ctws/core/day'
import { useMutation, useQuery } from '@tanstack/react-query'
import { problemText } from '../../../platform/http/api'
import { DangerAction } from '../../../platform/ui/DangerZone'
import { useForgetRecent } from '../../../shell/search'
import { useNow } from '../../../platform/time/useNow'
import { useAccountToday } from '../../../shell/auth'
import { cancelMeeting, earlierQuery, type EditScope, meetingKeys, seriesNotesQuery } from '../api'
import { deleteQuestion } from '../logic/deleteQuestion'
import { CancelScopeAsk } from './ScopeAsk'

/** A repeating meeting asks which occurrences to cancel; a one-off gets the plain question. */
export function CancelMeeting({
  meeting,
  whole = false,
  onCancelled,
}: {
  meeting: MeetingOccurrence
  /** The whole series and nothing less, as the edit page's foot deletes it (FR-068, FR-035). */
  whole?: boolean
  onCancelled: () => void
}) {
  const forget = useForgetRecent()
  const today = useAccountToday()
  const now = useNow()
  // What the whole series' deletion takes with it, for its question (FR-035).
  const upToToday = useQuery({
    ...earlierQuery(meeting.meetingId, addDays(today, 1)),
    enabled: whole && meeting.rrule !== null,
  })
  const notes = useQuery({ ...seriesNotesQuery(meeting.meetingId), enabled: whole })
  const held = (upToToday.data ?? []).filter((o) => new Date(o.startsAt) <= now).length
  const drop = useMutation({
    mutationFn: (scope: EditScope) => cancelMeeting(meeting.meetingId, scope, meeting.recurrenceId),
    meta: { changes: ['meeting'], awaits: [meetingKeys.all], ownsError: true },
    onSuccess: (_, scope) => {
      // One week of a series cancelled leaves the series; the whole of it does not.
      if (scope === 'all') forget('meeting', meeting.meetingId)
      onCancelled()
    },
  })
  return (
    <>
      <DangerAction
        label={whole ? 'Delete this meeting' : 'Cancel meeting'}
        confirmLabel={whole ? 'Confirm deleting this meeting' : 'Confirm cancelling this meeting'}
        message={
          whole
            ? deleteQuestion({
                title: meeting.title,
                repeats: meeting.rrule !== null,
                held,
                hasNotes: (notes.data ?? []).length > 0,
              })
            : `Cancel “${meeting.title}”? This cannot be undone.`
        }
        // A way out called "Cancel" would say the opposite of what it does here.
        confirm={whole ? 'Delete this meeting' : 'Cancel meeting'}
        back="Keep it"
        busy={drop.isPending}
        onConfirm={() => drop.mutate('all')}
      >
        {meeting.rrule && !whole
          ? (close) => (
              <CancelScopeAsk
                what={`Cancel which occurrences of “${meeting.title}”?`}
                onPick={(scope) => drop.mutate(scope)}
                onCancel={close}
              />
            )
          : undefined}
      </DangerAction>
      {drop.isError && (
        <p role="alert" className="text-ui text-stop-t">
          {problemText(drop.error)}
        </p>
      )}
    </>
  )
}
