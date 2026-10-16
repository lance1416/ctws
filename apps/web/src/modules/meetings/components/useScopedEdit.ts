import type { EditScope, MeetingOccurrence, UpdateMeetingInput } from '@ctws/contracts'
import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'
import { problemText } from '../../../platform/http/api'
import { patchMeeting } from '../api'

const moves = (patch: UpdateMeetingInput) =>
  patch.startsLocal !== undefined || patch.durationMinutes !== undefined

/**
 * Saves a meeting's form: when and how long belong to the occurrence, the rest to the series.
 * Moving a repeating meeting first asks which occurrences change.
 */
export function useScopedEdit(
  meeting: MeetingOccurrence,
  /** `moved` is the occurrence the server wrote when the save changed when it is or its length. */
  onSaved: (moved: MeetingOccurrence | null) => void,
) {
  /** A Save that moved a repeating meeting, held whole until "this one / from here on". */
  const [asking, setAsking] = useState<UpdateMeetingInput | null>(null)

  const save = useMutation({
    mutationFn: (patch: UpdateMeetingInput) => patchMeeting(meeting.meetingId, patch),
    meta: { awaits: [['meetings'], ['links']] },
  })

  // `all` is one write. Otherwise the series' fields go to all of it, then when and how long to
  // `scope`, which is only asked when one of them changed.
  const write = async (patch: UpdateMeetingInput, scope: EditScope) => {
    try {
      if (scope === 'all') {
        const saved = await save.mutateAsync({ ...patch, scope })
        onSaved(moves(patch) ? saved : null)
      } else {
        const { startsLocal, durationMinutes, ...series } = patch
        await save.mutateAsync({ ...series, scope: 'all' })
        const recurrenceId = meeting.recurrenceId
        onSaved(await save.mutateAsync({ startsLocal, durationMinutes, scope, recurrenceId }))
      }
    } catch {
      // Shown through `failed`.
    }
  }

  const submit = (patch: UpdateMeetingInput) => {
    // Nothing is written before the answer, so backing out leaves the meeting as it was.
    if (moves(patch) && meeting.rrule !== null) setAsking(patch)
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
