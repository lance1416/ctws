import type { ProjectId } from '@ctws/contracts'
import { useQuery } from '@tanstack/react-query'
import { KEY } from '../../platform/ui/buttonStyles'
import {
  followable,
  freeDigit,
  pinnedOf,
  pinResource,
  resourceName,
  resourcesQuery,
} from '../resources/api'
import { ResourceAdd } from '../resources/ResourceAdd'
import { useGoOut } from '../resources/away'
import { ResourceIcon } from '../resources/ResourceIcon'

/**
 * THE PINNED RESOURCES under a project's head (FR-053, artboard 8): each a chip with its service
 * and the digit that opens it, then a "+" to pin another. With none pinned, only the "+".
 */
export function PinnedResources({ projectId, name }: { projectId: ProjectId; name: string }) {
  const owner = { type: 'project', id: projectId } as const
  const all = useQuery(resourcesQuery(owner))
  const goOut = useGoOut()
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
          onClick={() =>
            goOut({
              url: r.url,
              name: resourceName(r),
              from: { type: 'project', id: projectId, title: name, projectId },
            })
          }
          className="inline-flex h-7 items-center gap-1.5 rounded-control border border-line bg-panel px-2.5 text-meta font-medium text-ink hover:border-line-strong max-lg:tap max-lg:text-ui"
        >
          <ResourceIcon url={r.url} />
          {resourceName(r)}
          {/* A phone has no digit keys (DES-001 "项目页"). */}
          <span aria-hidden="true" className={`${KEY} max-lg:hidden`}>
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
