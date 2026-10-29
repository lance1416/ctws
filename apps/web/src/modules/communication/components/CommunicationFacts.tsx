import { useQuery } from '@tanstack/react-query'
import { awaitingQuery } from '../api'

/** Things' count for communication: how many are awaiting a reply, zero included. */
export function AwaitingCount() {
  const awaiting = useQuery(awaitingQuery())
  if (!awaiting.data) return null
  return <span data-count>{awaiting.data.length}</span>
}

/** What a phone's More says beside Communication (FR-085): "Awaiting 2", or nothing. */
export function AwaitingMoreCount() {
  const awaiting = useQuery(awaitingQuery())
  const n = awaiting.data?.length ?? 0
  if (n === 0) return null
  return (
    <span data-count className="inline-flex items-center gap-2">
      <span className="inline-flex h-6 items-center rounded-control bg-warn-bg px-2 text-meta font-medium text-warn-t">
        Awaiting
      </span>
      {n}
    </span>
  )
}
