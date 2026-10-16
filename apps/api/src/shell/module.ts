import type { SQL } from 'drizzle-orm'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import type { Linkable } from './links/linkable'

/**
 * Counts a module adds to each row of the project list, keyed by their name in its `columns`.
 * Each is SQL correlated through the literal `projects.id`.
 */
export type ProjectColumns = Record<string, SQL<number>>

/** What a module hands the shell. */
export type ApiModule = {
  /** URL namespace: routes mount under /api/v1/<id>. */
  id: string
  routes: FastifyPluginAsyncZod
  linkable: Linkable
  projectColumns?: ProjectColumns
}
