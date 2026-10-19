import type { SQL } from 'drizzle-orm'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import type { TimelineSource } from './events/timeline'
import type { Linkable } from './links/linkable'

/**
 * Counts a module adds to each row of the project list, keyed by their name in its `columns`.
 * Each is SQL correlated through the literal `projects.id`.
 */
export type ProjectColumns = Record<string, SQL<number>>

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
  routes: FastifyPluginAsyncZod
  linkable: Linkable
  projectColumns?: ProjectColumns
  /** The kinds of timeline entry this module keeps about other things. */
  timelineSources?: readonly TimelineSource[]
}
