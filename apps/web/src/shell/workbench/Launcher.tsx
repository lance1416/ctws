import { resourceLook } from '@ctws/core'
import type { ProjectId, ResourceResponse } from '@ctws/contracts'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { useDocumentKeys } from '../../platform/keyboard/keyTable'
import { Block, BlockFailed, SkeletonRows } from '../../platform/ui/Block'
import { KEY } from '../../platform/ui/buttonStyles'
import { DialogFooter } from '../../platform/ui/DialogFooter'
import { textbox } from '../../platform/ui/formStyles'
import { LauncherIcon, NewIcon } from '../../platform/ui/icons'
import { Modal } from '../../platform/ui/Modal'
import { ProjectPicker, ProjectSquare, useEveryProject } from '../projects'
import { digitHandlers, WORKBENCH_KEYS } from '../projects/keys'
import {
  followable,
  pinnedEverywhereQuery,
  pinOnProject,
  resourceKeys,
  resourceName,
} from '../resources/api'
import { useGoOut } from '../resources/away'
import { ResourceIcon } from '../resources/ResourceIcon'

/** Two rows of four, the last cell for pinning another: the launcher's seven, keys 1 to 7. */
const SHOWN = 7

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
  const shown = (pinned.data ?? []).slice(0, SHOWN)
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
        className="flex flex-1 items-center justify-center gap-1.5 rounded-card border border-dashed border-line text-meta text-subtle hover:border-line-strong hover:text-ink"
      >
        <NewIcon size={14} aria-hidden="true" />
        Pin a link
      </button>
      {open && <PinDialog onClose={() => setOpen(false)} />}
    </>
  )
}

function PinDialog({ onClose }: { onClose: () => void }) {
  const [project, setProject] = useState<ProjectId | null>(null)
  const [url, setUrl] = useState('')
  const [name, setName] = useState('')
  const typed = url.trim()
  const recognised = /^https?:\/\/\S+$/i.test(typed)
  const pin = useMutation({
    mutationFn: async () => {
      const made = await pinOnProject(project!, { url: typed, name: name.trim() || null })
      if (!made) throw new Error('Nine are pinned on that project, one for each digit')
      return made
    },
    meta: { changes: ['project'], awaits: [resourceKeys.pinned], ownsError: true },
    onSuccess: onClose,
  })
  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (recognised && project) pin.mutate()
  }
  return (
    <Modal title="Pin a link" onClose={onClose} unsaved={typed !== '' || name.trim() !== ''}>
      <form onSubmit={submit} noValidate aria-label="Pin a link" className="flex flex-col gap-3">
        <input
          type="url"
          autoFocus
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://"
          aria-label="Address"
          className={`w-full ${textbox}`}
        />
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={recognised ? resourceLook(typed).label : 'Name (optional)'}
          aria-label="Name (optional)"
          className={`w-full ${textbox}`}
        />
        <ProjectPicker value={project} onPick={setProject} none="Pin on…" />
        {pin.isError && (
          <p role="alert" className="text-meta text-stop-t">
            {pin.error.message.startsWith('Nine')
              ? pin.error.message
              : 'Couldn’t pin it. What you typed is still here.'}
          </p>
        )}
        <DialogFooter
          submit="Pin"
          busy={pin.isPending}
          disabled={!recognised || !project}
          onCancel={onClose}
        />
      </form>
    </Modal>
  )
}
