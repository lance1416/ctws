import type { ProjectMovementResponse } from '@ctws/contracts'
import { apiFetch } from '../api'

/**
 * The single accessor for the ['movement'] cache key, which feeds the Movement panel.
 *
 * The server owns every number here: the week boundary and the day count are computed in the
 * user's timezone, and the order is the project order the rail already uses. Nothing is
 * re-derived on this side -- in particular there is no ratio to derive, because there is no
 * rollup to derive one from (see the contract).
 */
export async function listMovement(): Promise<ProjectMovementResponse[]> {
  return (await apiFetch<{ projects: ProjectMovementResponse[] }>('/tasks/movement')).projects
}
