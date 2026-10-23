import type { LastExchange, NextAbout, ObjectType, WorkspaceId } from '@ctws/contracts'
import type { Queryable } from '../../platform/db/client'
import type { NextAt } from './linkable'
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
  at: NextAt,
): Promise<Map<string, NextAbout>> {
  const out = new Map<string, NextAbout>()
  if (about.length === 0) return out
  const parts = await Promise.all(registry.all.map((l) => l.nextAbout?.(q, workspaceId, about, at)))
  for (const part of parts) {
    for (const [id, next] of part ?? []) out.set(id, { ...out.get(id), ...next })
  }
  return out
}

/**
 * The latest exchange with each of these people, by their id, across every module that keeps
 * exchanges (FR-060): whichever of a message and a meeting together was last. None, not a key.
 */
export async function lastAbout(
  registry: LinkRegistry,
  q: Queryable,
  workspaceId: WorkspaceId,
  people: readonly string[],
  now: Date,
): Promise<Map<string, LastExchange>> {
  const out = new Map<string, LastExchange>()
  if (people.length === 0) return out
  const parts = await Promise.all(
    registry.all.map((l) => l.lastAbout?.(q, workspaceId, people, now)),
  )
  for (const part of parts) {
    for (const [id, last] of part ?? []) {
      const held = out.get(id)
      if (!held || held.at < last.at) out.set(id, last)
    }
  }
  return out
}
