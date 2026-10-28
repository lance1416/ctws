import type { CommunicationResponse } from '@ctws/contracts'
import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'
import { problemText } from '../../../platform/http/api'
import { KIND_ICON } from '../../../platform/ui/icons'
import { useAccountToday } from '../../../shell/auth'
import { DayPickButton } from '../../../shell/dates'
import { communicationKeys, patchMessage } from '../api'
import { nextMonday } from '../logic/followUp'
import { LogMessage } from './LogMessage'

const SMALL =
  'inline-flex h-7 items-center gap-1.5 rounded-control border border-line-strong px-2.5 text-meta font-medium text-ink hover:bg-hover'

/** Moves a waiting message's follow-up day: "Later", "Follow up Mon" (FR-048, FR-079). */
function useFollowUpOn(message: CommunicationResponse) {
  return useMutation({
    mutationFn: (followUpOn: string) => patchMessage(message.id, { followUpOn }),
    meta: { changes: ['communication'], awaits: [communicationKeys.all], ownsError: true },
  })
}

/**
 * What can be done with a message still waiting (FR-048, FR-071, FR-079): log the reply, which
 * closes it, or move its follow-up day, to a day picked (Later) or to next Monday.
 */
export function AwaitingActions({
  message,
  later,
}: {
  message: CommunicationResponse
  /** "Later" picks a day; "monday" moves it to next Monday in one press, as Today does. */
  later: 'pick' | 'monday'
}) {
  const today = useAccountToday()
  const [replying, setReplying] = useState(false)
  const move = useFollowUpOn(message)
  const about = message.subject ?? 'the message'
  return (
    <span className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
      <button
        type="button"
        onClick={() => setReplying(true)}
        aria-label={`Log the reply to ${about}`}
        className={SMALL}
      >
        <KIND_ICON.communication size={12} aria-hidden="true" className="text-communication" />
        Log the reply
      </button>
      {later === 'pick' ? (
        <DayPickButton
          label={`Follow up on ${about} later`}
          text="Later"
          today={today}
          onPick={(day) => move.mutate(day)}
        />
      ) : (
        <button
          type="button"
          disabled={move.isPending}
          onClick={() => move.mutate(nextMonday(today))}
          aria-label={`Follow up on ${about} Monday`}
          className={SMALL}
        >
          Follow up Mon
        </button>
      )}
      {move.isError && (
        <span role="alert" className="w-full text-right text-meta text-stop-t">
          {problemText(move.error)}
        </span>
      )}
      {replying && (
        <LogMessage
          what={{ kind: 'reply', to: message }}
          onClose={() => setReplying(false)}
          onDone={() => setReplying(false)}
        />
      )}
    </span>
  )
}
