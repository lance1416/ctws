import type { EditScope, MeetingOccurrence, UpdateMeetingInput } from '@ctws/contracts'
import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'
import { patchMeeting } from '../api'

/**
 * SAVING A MEETING'S FORM. When and how long belong to the occurrence; everything else is the
 * series'. Moving a repeating meeting asks once which occurrences change -- the one answer a
 * calendar cannot guess -- and only about what this Save really changed.
 */
export function useScopedEdit(meeting: MeetingOccurrence, onSaved: () => void) {
  const [failed, setFailed] = useState<string | null>(null)
  /** The when-part of a Save, waiting on "this one / from here on". */
  const [asking, setAsking] = useState<UpdateMeetingInput | null>(null)

  const save = useMutation({
    mutationFn: (patch: UpdateMeetingInput) => patchMeeting(meeting.meetingId, patch),
    meta: { awaits: [['meetings'], ['links']] },
    onSuccess: () => setFailed(null),
    onError: (e) => setFailed(e instanceof Error ? e.message : "Couldn't save it"),
  })

  const submit = (patch: UpdateMeetingInput) => {
    const { startsLocal, durationMinutes, ...series } = patch
    const when: UpdateMeetingInput = {}
    if (startsLocal !== undefined) when.startsLocal = startsLocal
    if (durationMinutes !== undefined) when.durationMinutes = durationMinutes

    // The title, the place, who is in it and the rule itself are the series', never asked about.
    save.mutate({ ...series, scope: 'all' })
    if (Object.keys(when).length === 0) {
      onSaved()
      return
    }
    // Only a repeating meeting has "this one or from here on" to ask.
    if (meeting.rrule === null) {
      save.mutate({ ...when, scope: 'all' })
      onSaved()
      return
    }
    setAsking(when)
  }

  return {
    submit,
    asking: asking !== null,
    pick: (scope: EditScope) => {
      save.mutate({ ...asking, scope, recurrenceId: meeting.recurrenceId })
      setAsking(null)
      onSaved()
    },
    /** Back to the form, which is still open under the question. */
    back: () => setAsking(null),
    busy: save.isPending,
    failed,
  }
}
