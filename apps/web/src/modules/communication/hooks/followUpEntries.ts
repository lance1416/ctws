import type { CalendarEntry } from '@ctws/contracts'
import { useQuery } from '@tanstack/react-query'
import { awaitingQuery } from '../api'

/**
 * Follow-ups on the calendar (FR-080) and in the workbench's week (FR-076): each message still
 * awaiting a reply, on the day it is to be chased. Their days are calendar days already, so no
 * zone moves them.
 */
export function useFollowUpEntries(range: { from: string; to: string }) {
  const awaiting = useQuery(awaitingQuery())
  const entries = (awaiting.data ?? []).flatMap((m): CalendarEntry[] =>
    m.followUpOn && m.followUpOn >= range.from && m.followUpOn <= range.to
      ? [
          {
            type: 'communication',
            id: m.id,
            kind: 'follow-up',
            recurrenceId: null,
            day: m.followUpOn,
            title: m.subject ?? m.parties.map((p) => p.name).join(', '),
            startsAt: null,
            endsAt: null,
            timeZone: null,
            turns: null,
            joinUrl: null,
            projectId: m.projectId,
            projectName: m.projectName,
          },
        ]
      : [],
  )
  return { entries, isError: awaiting.isError, retry: () => void awaiting.refetch() }
}
