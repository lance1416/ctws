import type { LinkKind } from '@ctws/contracts'
import type { Db } from '../../platform/db/client'
import type { Actor } from '../../platform/db/scope'
import { NotFound } from '../../platform/errors'
import { exists } from './read'
import type { LinkRegistry } from './registry'
import { addLink, type Endpoint, type StoredLink } from './store'

/**
 * Adds an edge between two things this workspace can see. The edge table has no foreign keys at
 * its ends, so the checks stand in for them, in the same transaction as the write.
 */
export async function linkObjects(
  registry: LinkRegistry,
  db: Db,
  edge: Actor & { from: Endpoint; to: Endpoint; kind: LinkKind },
): Promise<{ link: StoredLink; created: boolean }> {
  return db.transaction(async (tx) => {
    const { workspaceId, from, to } = edge
    if (!(await exists(registry, tx, workspaceId, from))) throw new NotFound('Object')
    if (!(await exists(registry, tx, workspaceId, to))) throw new NotFound('Object')
    return addLink(tx, edge)
  })
}
