import type { SearchTaskResponse } from '@ctws/contracts'
import { apiFetch } from '../../../platform/http/api'

// The server owns the matching and the order; nothing here re-ranks or re-filters.
export async function searchTasks(query: string): Promise<SearchTaskResponse[]> {
  const path = `/tasks/search?q=${encodeURIComponent(query)}`
  return (await apiFetch<{ tasks: SearchTaskResponse[] }>(path)).tasks
}
