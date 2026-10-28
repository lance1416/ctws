import { idFrom, projectId as projectIdSchema } from '@ctws/contracts'
import { useQuery } from '@tanstack/react-query'
import { NarrowBlocks, NarrowHead } from '../inspector/narrow'
import { useNarrowKindBlocks } from '../inspector/kindBlocks'
import { useRegistry } from '../registry'
import { pinnedOf, resourcesQuery } from '../resources/api'
import { useEveryProject } from './api'
import { PinnedResources } from './PinnedResources'
import { ProjectSquare } from './ProjectSquare'

/**
 * A PROJECT IN THE INSPECTOR (FR-022, artboard 33): its square and name, how many are open; what
 * it pins; its top level, the whole tree a click on; then the meetings, messages and the rest
 * that modules list in it.
 */
export function ProjectNarrow({ id }: { id: string }) {
  const projects = useEveryProject()
  const registry = useRegistry()
  const projectId = idFrom(projectIdSchema, id)
  const resources = useQuery(resourcesQuery({ type: 'project', id: projectId }))
  const owned = registry.projectThings.map((t) => ({ kind: t.kind, ...t.useThings(projectId) }))
  const blocks = useNarrowKindBlocks({
    of: { type: 'project', id },
    kinds: registry.projectThings.map((t) => t.kind),
    owned,
    fullPage: `/projects/${id}`,
  })
  const project = projects.data?.find((p) => p.id === id)
  if (projects.isSuccess && !project)
    return <p className="p-4 text-ui text-muted">This project is not here any more.</p>
  if (!project) return null
  const Tasks = registry.projectNarrow
  const pinned = pinnedOf(resources.data ?? [])
  return (
    <>
      <NarrowHead mark={<ProjectSquare project={project} size={28} />} title={project.name} />
      {pinned.length > 0 && (
        <section aria-label="Pinned" className="flex flex-col gap-2 border-t border-line px-4 py-3">
          <h3 className="text-ui font-medium text-ink">Pinned</h3>
          <PinnedResources projectId={projectId} name={project.name} />
        </section>
      )}
      {Tasks && <Tasks projectId={projectId} />}
      <NarrowBlocks blocks={blocks} />
    </>
  )
}
