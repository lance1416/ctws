import type { ObjectType, WorkspaceId } from '@ctws/contracts'
import type { SQL } from 'drizzle-orm'
import type { Queryable, Tx } from '../platform/db/client'
import type { Actor } from '../platform/db/scope'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import type { TimelineSource } from './events'
import type { Linkable } from './links/linkable'
import type { LinkRegistry } from './links/registry'
import type { ProjectGraves } from './projects/service'

/**
 * Counts a module adds to each row of the project list, keyed by their name in its `columns`.
 * Each is SQL correlated through the literal `projects.id`.
 */
export type ProjectColumns = Record<string, SQL<number>>

/**
 * What a module counts of a window for the review's "Also this week", each by a name no
 * other module uses. The window is instants, its end no later than now.
 */
export type WeekCounts = (
  q: Queryable,
  workspaceId: WorkspaceId,
  window: { from: Date; to: Date },
) => Promise<Record<string, number>>

/**
 * A module's free text, for finding where things are named without being mentioned: which of its
 * things have it, read, and written anew. A rewrite is a change of that text like any other: it
 * is logged and its mentions are kept in step, by the module that owns it.
 */
export type TextSource = {
  type: ObjectType
  /** Its things whose text has any of `words` in it, whatever their case. */
  find(
    q: Queryable,
    workspaceId: WorkspaceId,
    words: readonly string[],
  ): Promise<{ id: string; text: string }[]>
  read(q: Queryable, workspaceId: WorkspaceId, id: string): Promise<string | null>
  /** Writes `next` over the text when it is still `was`; false when it changed meanwhile. */
  rewrite(tx: Tx, ctx: Actor, id: string, was: string, next: string): Promise<boolean>
}

/** The environment as the process got it: a module reads its own settings from it. */
export type EnvSource = Readonly<Record<string, string | undefined>>

/**
 * A module before the app is built from it: its settings come from the environment, and `deps`
 * replaces its outside parts, for tests.
 */
export type ModuleDefinition<Deps extends object = object> = {
  build: (env: EnvSource, deps: Partial<Deps>) => ApiModule
}

/** A module with no settings and nothing outside it to replace. */
export const fixedModule = (module: ApiModule): ModuleDefinition => ({ build: () => module })

/** What a module hands the shell. */
export type ApiModule = {
  /** URL namespace: routes mount under /api/v1/<id>. */
  id: string
  /** Given the registry, so a module names another module's things without importing it. */
  routes: FastifyPluginAsyncZod<{ registry: LinkRegistry }>
  linkable: Linkable
  projectColumns?: ProjectColumns
  /**
   * The kinds of timeline entry this module keeps about other things; given the registry, so an
   * entry can name another module's things.
   */
  timelineSources?: (registry: LinkRegistry) => readonly TimelineSource[]
  /** What of this module's goes with a project when the project is deleted: the tasks in it. */
  projectGraves?: ProjectGraves
  weekCounts?: WeekCounts
  /** Its free text, where other things may be named without an @. */
  texts?: TextSource
}
