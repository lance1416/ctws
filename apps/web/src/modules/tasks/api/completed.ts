import type { CompletedResponse } from '@ctws/contracts'
import { apiFetch } from '../../../platform/http/api'

/** Newest first; the server decides each task's day and whether this is the whole history. */
export function listCompleted(): Promise<CompletedResponse> {
  return apiFetch<CompletedResponse>('/tasks/completed')
}
