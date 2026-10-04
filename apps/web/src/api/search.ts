import type { SearchTaskResponse } from '@ctws/contracts'
import { apiFetch } from '../api'

// The single accessor for the ['search', q] cache key. The server owns the matching and the
// order; nothing here re-ranks or re-filters.
export async function searchTasks(query: string): Promise<SearchTaskResponse[]> {
  const path = `/search?q=${encodeURIComponent(query)}`
  return (await apiFetch<{ tasks: SearchTaskResponse[] }>(path)).tasks
}
