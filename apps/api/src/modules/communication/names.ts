import type { WorkspaceId } from '@ctws/contracts'
import type { Queryable } from '../../platform/db/client'
import type { LinkRegistry } from '../../shell/links'
import type { CommunicationRow } from './queries'

/**
 * The names of every party of these rows, by `type:id`, through the registry: one lookup per kind,
 * so this module never reads the people or organisations tables. One the workspace can no longer
 * see has no name, and is left out where it is drawn.
 */
export async function partyNames(
  registry: LinkRegistry,
  q: Queryable,
  workspaceId: WorkspaceId,
  rows: readonly Pick<CommunicationRow, 'parties'>[],
): Promise<Map<string, string>> {
  const names = new Map<string, string>()
  for (const type of ['person', 'organisation'] as const) {
    const ids = [
      ...new Set(rows.flatMap((r) => r.parties.filter((p) => p.type === type).map((p) => p.id))),
    ]
    if (ids.length === 0) continue
    for (const thing of await registry.of(type).rows(q, workspaceId, { ids, limit: ids.length })) {
      names.set(`${type}:${thing.id}`, thing.title)
    }
  }
  return names
}
