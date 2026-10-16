import type { MeetingOccurrence } from '@ctws/contracts'
import { useMutation } from '@tanstack/react-query'
import { problemText } from '../../../platform/http/api'
import { DangerAction } from '../../../platform/ui/DangerZone'
import { useForgetRecent } from '../../../shell/search'
import { cancelMeeting, type EditScope, meetingKeys } from '../api'
import { CancelScopeAsk } from './ScopeAsk'

/** A repeating meeting asks which occurrences to cancel; a one-off gets the plain question. */
export function CancelMeeting({
  meeting,
  onCancelled,
}: {
  meeting: MeetingOccurrence
  onCancelled: () => void
}) {
  const forget = useForgetRecent()
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
        label="Cancel meeting"
        confirmLabel="Confirm cancelling this meeting"
        message={`Cancel “${meeting.title}”? This cannot be undone.`}
        // A way out called "Cancel" would say the opposite of what it does here.
        confirm="Cancel meeting"
        back="Keep it"
        busy={drop.isPending}
        onConfirm={() => drop.mutate('all')}
      >
        {meeting.rrule
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
        <p role="alert" className="text-sm text-danger">
          {problemText(drop.error)}
        </p>
      )}
    </>
  )
}
