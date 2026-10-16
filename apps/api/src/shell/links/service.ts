import type { LinkKind, WorkspaceId } from '@ctws/contracts'
import type { Db } from '../../platform/db/client'
import { LinkEndNotFoundError } from './errors'
import { exists } from './read'
import type { LinkRegistry } from './registry'
import { addLink, type Endpoint } from './store'

/**
 * Adds an edge between two things this workspace can see. The edge table has no foreign keys at
 * its ends, so the checks stand in for them, in the same transaction as the write.
 */
export async function linkObjects(
  registry: LinkRegistry,
  db: Db,
  edge: { workspaceId: WorkspaceId; from: Endpoint; to: Endpoint; kind: LinkKind },
): Promise<void> {
  await db.transaction(async (tx) => {
    const { workspaceId, from, to } = edge
    if (!(await exists(registry, tx, workspaceId, from))) throw new LinkEndNotFoundError()
    if (!(await exists(registry, tx, workspaceId, to))) throw new LinkEndNotFoundError()
    await addLink(tx, edge)
  })
}
