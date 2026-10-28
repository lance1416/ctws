import type { ProjectId } from '@ctws/contracts'
import { useQuery } from '@tanstack/react-query'
import type { OwnThings } from '../../../shell/contract'
import { useAccountToday } from '../../../shell/auth'
import { awaitingQuery } from '../api'
import { followUpChip, followUpTone } from '../logic/followUp'
import { TONE } from '../pages/CommunicationOverview'

/**
 * Who is waiting for a reply in a project (FR-055): the messages filed under it still awaiting
 * one, the soonest follow-up first, each with whom and its follow-up day in its tone.
 */
export function useProjectAwaiting(projectId: ProjectId): OwnThings {
  const awaiting = useQuery(awaitingQuery())
  const today = useAccountToday()
  return {
    things: (awaiting.data ?? [])
      .filter((m) => m.projectId === projectId)
      .map((m) => ({
        id: m.id,
        title: m.subject ?? 'No subject',
        sub: m.parties.map((p) => p.name).join(', ') || 'No one',
        trail: m.followUpOn ? (
          <span
            className={`inline-flex h-5.5 shrink-0 items-center rounded-control px-2 text-meta font-medium ${TONE[followUpTone(m.followUpOn, today)]}`}
          >
            {followUpChip(m.followUpOn, today)}
          </span>
        ) : undefined,
      })),
    isPending: awaiting.isPending,
    isError: awaiting.isError,
    retry: () => void awaiting.refetch(),
  }
}
