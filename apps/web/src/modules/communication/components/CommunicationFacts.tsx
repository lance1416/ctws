import { useQuery } from '@tanstack/react-query'
import { awaitingQuery } from '../api'

/** Things' count for communication: how many are awaiting a reply, zero included. */
export function AwaitingCount() {
  const awaiting = useQuery(awaitingQuery())
  if (!awaiting.data) return null
  return <span data-count>{awaiting.data.length}</span>
}
