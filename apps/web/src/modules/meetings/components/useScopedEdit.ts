import type { MeetingOccurrence, UpdateSeriesBody } from '@ctws/contracts'
import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'
import { problemText } from '../../../platform/http/api'
import {
  continueSeries,
  type EditScope,
  patchOccurrence,
  patchSeries,
  readOccurrence,
} from '../api'

const moves = (patch: UpdateSeriesBody) =>
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
  const [asking, setAsking] = useState<UpdateSeriesBody | null>(null)

  const save = useMutation({
    mutationFn: ({ patch, scope }: { patch: UpdateSeriesBody; scope: EditScope }) =>
      writeScoped(meeting, patch, scope),
    meta: { awaits: [['meetings'], ['links']] },
  })

  const write = async (patch: UpdateSeriesBody, scope: EditScope) => {
    try {
      onSaved(await save.mutateAsync({ patch, scope }))
    } catch {
      // Shown through `failed`.
    }
  }

  const submit = (patch: UpdateSeriesBody) => {
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

/**
 * `all` is one write, to the series. Otherwise the series' fields go to all of it, then when and
 * how long to the occurrence, or to the series that takes over from it. Answers with the
 * occurrence that was moved, or null when nothing moved.
 */
async function writeScoped(
  meeting: MeetingOccurrence,
  patch: UpdateSeriesBody,
  scope: EditScope,
): Promise<MeetingOccurrence | null> {
  const id = meeting.meetingId
  if (scope === 'all') {
    const series = await patchSeries(id, patch)
    // A moved series is followed to the occurrence it now starts with.
    return moves(patch) ? readOccurrence(id, series.startsLocal) : null
  }
  const { startsLocal, durationMinutes, ...series } = patch
  const when = {
    ...(startsLocal !== undefined ? { startsLocal } : {}),
    ...(durationMinutes !== undefined ? { durationMinutes } : {}),
  }
  if (Object.keys(series).length > 0) await patchSeries(id, series)
  return scope === 'one'
    ? patchOccurrence(id, meeting.recurrenceId, when)
    : continueSeries(id, meeting.recurrenceId, when)
}
