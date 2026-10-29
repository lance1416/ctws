import { idFrom, projectId as projectIdSchema } from '@ctws/contracts'
import type { PrefetchAt } from '../layout/page'
import { linksQuery } from '../links/api'
import { resourcesQuery } from '../resources/api'
import { projectLinkKinds } from './ProjectLinked'

/**
 * What a project's page reads, started as soon as the session is known (baseline.md §8): its rows,
 * its blocks' links and pins, and each module's own things in it, the queries the page makes.
 */
export function prefetchProject({ qc, params, today, registry }: PrefetchAt): void {
  const parsed = projectIdSchema.safeParse(params.id)
  if (!parsed.success) return
  const id = idFrom(projectIdSchema, parsed.data)
  registry.projectMain?.prefetch?.(qc, id)
  void qc.prefetchQuery(linksQuery({ type: 'project', id }, projectLinkKinds(registry)))
  void qc.prefetchQuery(resourcesQuery({ type: 'project', id }))
  for (const things of registry.projectThings) things.prefetch?.(qc, id, today)
}
