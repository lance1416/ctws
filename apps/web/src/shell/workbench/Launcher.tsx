import { resourceLook } from '@ctws/core'
import { PinLink } from '../resources/PinLink'
import type { ResourceResponse } from '@ctws/contracts'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { useDocumentKeys } from '../../platform/keyboard/keyTable'
import { Block, BlockFailed, SkeletonRows } from '../../platform/ui/Block'
import { KEY } from '../../platform/ui/buttonStyles'
import { LauncherIcon, NewIcon } from '../../platform/ui/icons'
import { ProjectSquare, useEveryProject } from '../projects'
import { digitHandlers, LAUNCHER_LINKS, WORKBENCH_KEYS } from '../projects/keys'
import { followable, pinnedEverywhereQuery, resourceName } from '../resources/api'
import { useGoOut } from '../resources/away'
import { ResourceIcon } from '../resources/ResourceIcon'

/** Where a resource is from, under its name: the service's word, GitHub, or the site. */
function sourceOf(r: ResourceResponse): string {
  const look = resourceLook(r.url)
  return r.name === null || look.service.startsWith('github') ? look.source : look.label
}

/**
 * THE LAUNCHER (FR-076, artboards 10 and 22): what the projects still worked on pin in their heads,
 * each with its service, its name, its project and where it is from, and the digit that opens it;
 * then a cell to pin another link. Tall cells where rows share the screen, cells on their side in
 * rows of 236.
 */
export function Launcher({ tall }: { tall: boolean }) {
  const pinned = useQuery(pinnedEverywhereQuery())
  const projects = useEveryProject()
  const goOut = useGoOut()
  const shown = (pinned.data ?? []).slice(0, LAUNCHER_LINKS)
  const open = (r: ResourceResponse) => {
    const project = projects.data?.find((p) => p.id === r.owner.id)
    goOut({
      url: r.url,
      name: resourceName(r),
      from: { type: 'project', id: r.owner.id, title: project?.name ?? '', projectId: r.owner.id },
    })
  }
  useDocumentKeys(WORKBENCH_KEYS, {
    ...digitHandlers((digit) => {
      const r = shown[digit - 1]
      const url = followable(r?.url ?? '')
      if (!r || !url) return
      open(r)
      window.open(url, '_blank', 'noopener,noreferrer')
    }),
  })
  const badge = { icon: LauncherIcon, tint: 'bg-hover text-muted' }
  return (
    <Block
      badge={badge}
      title="Launcher"
      count={<span className="text-muted">Pinned on active projects</span>}
    >
      {pinned.isError ? (
        <BlockFailed what="launcher" onRetry={() => void pinned.refetch()} />
      ) : !pinned.isSuccess ? (
        <SkeletonRows rows={2} />
      ) : (
        <ul className="grid min-h-0 flex-1 auto-rows-fr grid-cols-4 gap-2 p-3 max-sm:grid-cols-2">
          {shown.map((r, i) => {
            const project = projects.data?.find((p) => p.id === r.owner.id)
            const digit = (
              <span aria-hidden="true" className={KEY}>
                {i + 1}
              </span>
            )
            const where = (
              <span className="flex min-w-0 items-center gap-1.5 text-meta text-muted">
                {project && <ProjectSquare project={project} />}
                <span className="truncate">{sourceOf(r)}</span>
              </span>
            )
            return (
              <li key={r.id} className="flex min-h-0 min-w-0">
                <a
                  href={followable(r.url)}
                  target="_blank"
                  rel="noreferrer noopener"
                  data-launcher={i + 1}
                  onClick={() => open(r)}
                  className={`flex min-w-0 flex-1 rounded-card border border-line text-ui text-ink hover:border-line-strong hover:bg-hover ${
                    tall ? 'flex-col gap-2 p-3' : 'items-center gap-2.5 px-2.5 py-2'
                  }`}
                >
                  {tall ? (
                    <>
                      <span className="flex items-center justify-between">
                        <ResourceIcon url={r.url} size={16} />
                        {digit}
                      </span>
                      <span className="truncate font-medium">{resourceName(r)}</span>
                      {where}
                    </>
                  ) : (
                    <>
                      <ResourceIcon url={r.url} size={16} />
                      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <span className="truncate font-medium">{resourceName(r)}</span>
                        {where}
                      </span>
                      {digit}
                    </>
                  )}
                </a>
              </li>
            )
          })}
          <li className="flex min-h-0 min-w-0">
            <PinALink />
          </li>
        </ul>
      )}
    </Block>
  )
}

/**
 * The launcher's last cell: pin a link in a project's head, at the first digit free there. It asks
 * in a small dialog: the address, a name if wanted, and the project to pin it on.
 */
function PinALink() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex flex-1 items-center justify-center gap-1.5 rounded-card border border-dashed border-line text-meta text-subtle hover:border-line-strong hover:text-ink max-lg:tap"
      >
        <NewIcon size={14} aria-hidden="true" />
        Pin a link
      </button>
      {open && <PinLink onClose={() => setOpen(false)} pick />}
    </>
  )
}
