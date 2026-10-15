import type { CompletedResponse } from '@ctws/contracts'
import { apiFetch } from '../../../platform/http/api'

/**
 * The server owns the order (newest first), the day each task belongs to, and whether this is the
 * whole history -- nothing here re-derives any of them.
 */
export function listCompleted(): Promise<CompletedResponse> {
  return apiFetch<CompletedResponse>('/tasks/completed')
}
