import type { EditScope, MeetingOccurrence, UpdateMeetingInput } from '@ctws/contracts'
import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'
import { problemText } from '../../../platform/http/api'
import { patchMeeting } from '../api'

/**
 * SAVING A MEETING'S FORM. When and how long belong to the occurrence; everything else is the
 * series'. Moving a repeating meeting asks once which occurrences change -- the one answer a
 * calendar cannot guess -- and only about what this Save really changed.
 */
export function useScopedEdit(meeting: MeetingOccurrence, onSaved: () => void) {
  /** A Save that moved a repeating meeting, held whole until "this one / from here on". */
  const [asking, setAsking] = useState<UpdateMeetingInput | null>(null)

  const save = useMutation({
    mutationFn: (patch: UpdateMeetingInput) => patchMeeting(meeting.meetingId, patch),
    meta: { awaits: [['meetings'], ['links']] },
  })

  /**
   * The title, the place, who is in it and the rule are the series', written to all of it; then
   * when and how long, to `scope`. The form closes once the server has both, and stays open with
   * what was typed when it refuses.
   */
  const write = async (patch: UpdateMeetingInput, scope: EditScope) => {
    const { startsLocal, durationMinutes, ...series } = patch
    try {
      await save.mutateAsync({ ...series, scope: 'all' })
      if (startsLocal !== undefined || durationMinutes !== undefined) {
        const recurrenceId = scope === 'all' ? undefined : meeting.recurrenceId
        await save.mutateAsync({ startsLocal, durationMinutes, scope, recurrenceId })
      }
      onSaved()
    } catch {
      // Said by `failed`.
    }
  }

  const submit = (patch: UpdateMeetingInput) => {
    const moved = patch.startsLocal !== undefined || patch.durationMinutes !== undefined
    // Only a repeating meeting has "this one or from here on" to ask, and nothing of the Save is
    // written before the answer: backing out of the question leaves the meeting as it was.
    if (moved && meeting.rrule !== null) setAsking(patch)
    else void write(patch, 'all')
  }

  return {
    submit,
    asking: asking !== null,
    pick: (scope: EditScope) => {
      if (asking) void write(asking, scope)
      setAsking(null)
    },
    /** Back to the form, which is still open under the question. */
    back: () => setAsking(null),
    /** Forgets a refusal, for a form closed without saving. */
    reset: save.reset,
    busy: save.isPending,
    failed: problemText(save.error),
  }
}
