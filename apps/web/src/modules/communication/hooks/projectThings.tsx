import type { ProjectId } from '@ctws/contracts'
import { useQuery } from '@tanstack/react-query'
import type { OwnThings } from '../../../shell/contract'
import { addDays } from '@ctws/core/day'
import { monthDay, nearDay, ymd } from '../../../platform/time/dates'
import { FollowUpIcon } from '../../../platform/ui/icons'
import { useAccountToday, useTimeZone } from '../../../shell/auth'
import { awaitingQuery } from '../api'
import { followUpChip } from '../logic/followUp'
import { initialsOf } from '../logic/initials'

/**
 * AWAITING REPLY in a project (FR-055, artboard 8): the messages filed under it still awaiting
 * one, the soonest follow-up first, each with its day, whom, what and when to chase it.
 */
export function useProjectAwaiting(projectId: ProjectId): OwnThings {
  const awaiting = useQuery(awaitingQuery())
  const today = useAccountToday()
  const timeZone = useTimeZone()
  return {
    things: (awaiting.data ?? [])
      .filter((m) => m.projectId === projectId)
      .map((m) => ({
        id: m.id,
        // One line, as artboard 8 has it: the day it was sent, who with, what, and when to chase
        // it; a day gone by is a nudge in warn, not a missed deadline in red (U-12).
        lead: monthDay(ymd(new Date(m.occurredAt), timeZone)),
        withInitials: initialsOf(m.parties[0]?.name ?? ''),
        title: m.subject ?? 'No subject',
        trail: m.followUpOn ? (
          <span
            className={`inline-flex h-5.5 shrink-0 items-center gap-1 rounded-control px-2 text-meta font-medium ${
              m.followUpOn <= addDays(today, 1) ? 'bg-warn-bg text-warn-t' : 'bg-hover text-muted'
            }`}
          >
            <FollowUpIcon size={12} aria-hidden="true" />
            {nearDay(m.followUpOn, today) ?? followUpChip(m.followUpOn, today)}
          </span>
        ) : undefined,
      })),
    isPending: awaiting.isPending,
    isError: awaiting.isError,
    retry: () => void awaiting.refetch(),
  }
}
