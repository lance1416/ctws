import type { EditScope, MeetingOccurrence } from '@ctws/contracts'
import { useMutation } from '@tanstack/react-query'
import { DangerAction } from '../../../platform/ui/DangerZone'
import { useForgetRecent } from '../../../shell/search/recent'
import { cancelMeeting } from '../api'
import { ScopeAsk } from './ScopeAsk'

/**
 * CANCELLING A MEETING, at the foot of its pane. A repeating one is asked WHICH occurrences rather
 * than yes or no; a one-off has only itself, so it gets the plain question.
 */
export function CancelMeeting({
  meeting,
  onCancelled,
}: {
  meeting: MeetingOccurrence
  onCancelled: () => void
}) {
  const forget = useForgetRecent()
  const drop = useMutation({
    mutationFn: (scope: EditScope) =>
      cancelMeeting(meeting.meetingId, { scope, recurrenceId: meeting.recurrenceId }),
    meta: { awaits: [['meetings']] },
    onSuccess: (_, scope) => {
      // One week of a series cancelled leaves the series; the whole of it does not.
      if (scope === 'all') forget('meeting', meeting.meetingId)
      onCancelled()
    },
  })
  return (
    <DangerAction
      label="Cancel meeting"
      confirmLabel="Confirm cancelling this meeting"
      message={`Cancel “${meeting.title}”? This cannot be undone.`}
      // A meeting is cancelled, not deleted, and a way out called "Cancel" next to it would say
      // the opposite of what it does.
      confirm="Cancel meeting"
      back="Keep it"
      busy={drop.isPending}
      onConfirm={() => drop.mutate('all')}
    >
      {meeting.rrule
        ? (close) => (
            <ScopeAsk
              what={`Cancel which occurrences of “${meeting.title}”?`}
              onPick={(scope) => drop.mutate(scope)}
              onCancel={close}
              destroys
              back="Keep it"
            />
          )
        : undefined}
    </DangerAction>
  )
}
