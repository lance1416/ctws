import type { LinkCandidate, ObjectType, WorkspaceId } from '@ctws/contracts'
import type { Queryable } from '../../platform/db/client'
import type { LinkRegistry } from './registry'

/** One thing, by kind and id. */
export type Endpoint = { type: ObjectType; id: string }

/**
 * Things by name among the kinds asked; given the thing being related from, anything but itself.
 */
export async function candidatesFor(
  registry: LinkRegistry,
  q: Queryable,
  workspaceId: WorkspaceId,
  of: Endpoint | null,
  text: string,
  perType: number,
  kinds: readonly ObjectType[] = registry.order,
): Promise<LinkCandidate[]> {
  const found = await Promise.all(
    registry.order
      .filter((type) => kinds.includes(type))
      .map(async (type) => {
        const rows = await registry.of(type).rows(q, workspaceId, { text, limit: perType })
        return rows.filter((r) => !(of && type === of.type && r.id === of.id))
      }),
  )
  return found.flat()
}

/** Whether a thing exists and this workspace may see it: every cross-module write checks here. */
export async function exists(
  registry: LinkRegistry,
  q: Queryable,
  workspaceId: WorkspaceId,
  end: Endpoint,
): Promise<boolean> {
  const rows = await registry.of(end.type).rows(q, workspaceId, { ids: [end.id], limit: 1 })
  return rows.length > 0
}
