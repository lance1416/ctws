import { resourceLook } from '@ctws/core'
import { useMutation } from '@tanstack/react-query'
import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { BUTTON, ICON_BUTTON } from '../../platform/ui/buttonStyles'
import { textbox } from '../../platform/ui/formStyles'
import { NewIcon } from '../../platform/ui/icons'
import { LAYER } from '../../platform/ui/layers'
import { resourceKeys, type ResourceOwner } from './api'
import { ResourceIcon } from './ResourceIcon'

/**
 * HANG AN ADDRESS ON A THING (DES-001 section 4): a "+" that opens a small float, as the capture
 * box is drawn, with the address, an optional name and the service it was recognised as. `verb`
 * names its button: Pin in a project's head, Add in a thing's Resources.
 */
export function ResourceAdd({
  owner,
  verb,
  label,
  unavailable = null,
  write,
}: {
  owner: ResourceOwner
  verb: 'Pin' | 'Add'
  /** The + button's name, and the form's. */
  label: string
  /** Why it cannot take another now, said on the + it greys out; null when it can. */
  unavailable?: string | null
  write: (resource: { url: string; name: string | null }) => Promise<unknown>
}) {
  const [open, setOpen] = useState(false)
  const [url, setUrl] = useState('')
  const [name, setName] = useState('')
  const box = useRef<HTMLDivElement>(null)
  const address = useRef<HTMLInputElement>(null)
  const failure = useId()
  const save = useMutation({
    mutationFn: () => write({ url: url.trim(), name: name.trim() || null }),
    // A resource is its owner's: what reads the owner (its timeline) reads it too.
    meta: { changes: [owner.type], awaits: [resourceKeys.of(owner)], ownsError: true },
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
    if (recognised) save.mutate()
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
        disabled={unavailable !== null}
        aria-label={label}
        aria-expanded={open}
        title={unavailable ?? label}
        className={ICON_BUTTON}
      >
        <NewIcon size={16} aria-hidden="true" />
      </button>
      {open && (
        <form
          onSubmit={submit}
          aria-label={label}
          className={`absolute top-full ${verb === 'Pin' ? 'left-0' : 'right-0'} ${LAYER.menu} mt-1.5 flex w-96 max-w-[calc(100vw-2rem)] flex-col gap-2.5 rounded-block bg-float p-3 shadow-float`}
        >
          <input
            ref={address}
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://"
            aria-label="Address"
            aria-invalid={save.isError ? true : undefined}
            aria-describedby={save.isError ? failure : undefined}
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
              disabled={!recognised || save.isPending}
              className={`${BUTTON.primary} h-7 px-3 text-meta`}
            >
              {verb}
            </button>
          </div>
          {save.isError && (
            <p id={failure} role="alert" className="text-meta text-stop-t">
              Couldn’t {verb.toLocaleLowerCase()} it. What you typed is still here.
            </p>
          )}
        </form>
      )}
    </div>
  )
}
