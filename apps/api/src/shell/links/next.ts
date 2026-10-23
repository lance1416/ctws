import type { NextAbout, ObjectType, WorkspaceId } from '@ctws/contracts'
import type { Queryable } from '../../platform/db/client'
import type { LinkRegistry } from './registry'

/**
 * What comes next about each of these things, by their id (FR-058): every module with things still
 * to come adds its part, a meeting from one, a follow-up from another. Things with nothing next are
 * left out.
 */
export async function nextAbout(
  registry: LinkRegistry,
  q: Queryable,
  workspaceId: WorkspaceId,
  about: readonly { type: ObjectType; id: string }[],
  now: Date,
): Promise<Map<string, NextAbout>> {
  const out = new Map<string, NextAbout>()
  if (about.length === 0) return out
  const parts = await Promise.all(
    registry.all.map((l) => l.nextAbout?.(q, workspaceId, about, now)),
  )
  for (const part of parts) {
    for (const [id, next] of part ?? []) out.set(id, { ...out.get(id), ...next })
  }
  return out
}
