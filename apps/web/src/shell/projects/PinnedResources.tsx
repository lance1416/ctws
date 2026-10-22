import { resourceLook } from '@ctws/core'
import type { ProjectId, ResourceResponse } from '@ctws/contracts'
import { useQuery } from '@tanstack/react-query'
import { KEY } from '../../platform/ui/buttonStyles'
import { followable, freeDigit, pinnedOf, pinResource, resourcesQuery } from '../resources/api'
import { ResourceAdd } from '../resources/ResourceAdd'
import { ResourceIcon } from '../resources/ResourceIcon'

/**
 * THE PINNED RESOURCES under a project's head (FR-053, artboard 8): each a chip with its service
 * and the digit that opens it, then a "+" to pin another. With none pinned, only the "+".
 */
export function PinnedResources({ projectId }: { projectId: ProjectId }) {
  const owner = { type: 'project', id: projectId } as const
  const all = useQuery(resourcesQuery(owner))
  const pinned = pinnedOf(all.data ?? [])
  return (
    <div data-pinned-resources className="flex flex-wrap items-center gap-2">
      {pinned.map((r) => (
        <a
          key={r.id}
          href={followable(r.url)}
          target="_blank"
          rel="noreferrer noopener"
          data-pinned={r.pinnedRank}
          className="inline-flex h-7 items-center gap-1.5 rounded-control border border-line bg-panel px-2.5 text-meta font-medium text-ink hover:border-line-strong"
        >
          <ResourceIcon url={r.url} />
          {nameOf(r)}
          <span aria-hidden="true" className={KEY}>
            {r.pinnedRank}
          </span>
        </a>
      ))}
      {all.isSuccess && (
        <ResourceAdd
          owner={owner}
          verb="Pin"
          label="Pin a resource"
          unavailable={freeDigit(all.data) === null ? 'Nine are pinned, one for each digit' : null}
          write={(resource) => pinResource(owner, resource, freeDigit(all.data) ?? 9)}
        />
      )}
    </div>
  )
}

/** What a resource is called: its own name, else what its address says it is. */
const nameOf = (r: Pick<ResourceResponse, 'name' | 'url'>) => r.name ?? resourceLook(r.url).label
