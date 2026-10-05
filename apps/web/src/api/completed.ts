import type { CompletedTaskResponse } from '@ctws/contracts'
import { apiFetch } from '../api'

// The single accessor for the ['completed'] cache key. The server owns the order (newest first)
// and the day each task belongs to; nothing here re-derives either.
export async function listCompleted(): Promise<CompletedTaskResponse[]> {
  return (await apiFetch<{ tasks: CompletedTaskResponse[] }>('/tasks/completed')).tasks
}
