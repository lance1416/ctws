import { resourceLook } from '@ctws/core'
import type { ProjectId, ResourceResponse } from '@ctws/contracts'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { BUTTON, ICON_BUTTON, KEY } from '../../platform/ui/buttonStyles'
import { textbox } from '../../platform/ui/formStyles'
import { NewIcon } from '../../platform/ui/icons'
import { LAYER } from '../../platform/ui/layers'
import { freeDigit, pinnedOf, pinResource, resourceKeys, resourcesQuery } from '../resources/api'
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
          href={r.url}
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
      {all.isSuccess && <PinResource projectId={projectId} digit={freeDigit(all.data)} />}
    </div>
  )
}

/** What a resource is called: its own name, else what its address says it is. */
const nameOf = (r: Pick<ResourceResponse, 'name' | 'url'>) => r.name ?? resourceLook(r.url).label

/**
 * PIN A LINK (DES-001 section 4): a small float, as the capture box is drawn, with the address, an
 * optional name and the service it was recognised as. It takes the first digit free.
 */
function PinResource({ projectId, digit }: { projectId: ProjectId; digit: number | null }) {
  const [open, setOpen] = useState(false)
  const [url, setUrl] = useState('')
  const [name, setName] = useState('')
  const box = useRef<HTMLDivElement>(null)
  const address = useRef<HTMLInputElement>(null)
  const failure = useId()
  const owner = { type: 'project', id: projectId } as const
  const pin = useMutation({
    mutationFn: (to: number) =>
      pinResource(owner, { url: url.trim(), name: name.trim() || null }, to),
    // A resource is the project's: what reads the project (its timeline) reads it too.
    meta: { changes: ['project'], awaits: [resourceKeys.of(owner)], ownsError: true },
    onSuccess: () => {
      setOpen(false)
      setUrl('')
      setName('')
    },
  })
  useEffect(() => {
    if (open) address.current?.focus()
  }, [open])
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])
  const recognised = /^https?:\/\/\S+$/i.test(url.trim()) ? resourceLook(url.trim()) : null
  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (digit !== null && recognised) pin.mutate(digit)
  }
  return (
    <div
      ref={box}
      className="relative"
      onKeyDown={(e) => {
        if (e.key !== 'Escape' || !open) return
        e.preventDefault()
        e.stopPropagation()
        setOpen(false)
      }}
    >
      <button
        type="button"
        onClick={() => setOpen(!open)}
        disabled={digit === null}
        aria-label="Pin a resource"
        aria-expanded={open}
        title={digit === null ? 'Nine are pinned, one for each digit' : 'Pin a resource'}
        className={ICON_BUTTON}
      >
        <NewIcon size={16} aria-hidden="true" />
      </button>
      {open && (
        <form
          onSubmit={submit}
          aria-label="Pin a resource"
          className={`absolute top-full left-0 ${LAYER.menu} mt-1.5 flex w-96 flex-col gap-2.5 rounded-block bg-float p-3 shadow-float`}
        >
          <input
            ref={address}
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://"
            aria-label="Address"
            aria-invalid={pin.isError ? true : undefined}
            aria-describedby={pin.isError ? failure : undefined}
            className={`w-full bg-panel ${textbox}`}
          />
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={recognised ? recognised.label : 'Name (optional)'}
            aria-label="Name (optional)"
            className={`w-full bg-panel ${textbox}`}
          />
          <div className="flex items-center gap-2">
            {recognised && (
              <span
                data-recognised
                className="flex min-w-0 items-center gap-1.5 text-meta text-muted"
              >
                <ResourceIcon url={url.trim()} />
                <span className="truncate">{recognised.source || recognised.label}</span>
              </span>
            )}
            <span aria-hidden="true" className="flex-1" />
            <button
              type="submit"
              disabled={!recognised || pin.isPending}
              className={`${BUTTON.primary} h-7 px-3 text-meta`}
            >
              Pin
            </button>
          </div>
          {pin.isError && (
            <p id={failure} role="alert" className="text-meta text-stop-t">
              Couldn’t pin it. What you typed is still here.
            </p>
          )}
        </form>
      )}
    </div>
  )
}
