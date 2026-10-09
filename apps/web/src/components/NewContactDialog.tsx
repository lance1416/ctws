import { CHANNEL_KINDS, type ChannelKind, type ContactResponse } from '@ctws/contracts'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import { createContact } from '../api/contacts'
import { listProjects } from '../api/projects'
import { useComposing } from '../composition'
import { useProjectRail } from '../projectColor'
import { field, label } from './formStyles'
import { PickMany } from './inline'
import { Modal } from './Modal'

/**
 * NEW CONTACT, filled in once.
 *
 * A name alone is never all you know about somebody. The line-of-text box this stands beside is
 * right for the moment you only have a name -- and wrong every other time, because it then makes
 * you create the person and open them again to say anything else. That was the complaint: 「每次
 * 创建完了还要点开才能编辑别的东西」. Both ways in stay: the box for a name, this for a person.
 */
const KIND_LABEL: Record<ChannelKind, string> = { email: 'Email', phone: 'Phone', url: 'Link' }

export function NewContactDialog({
  onClose,
  onMade,
}: {
  onClose: () => void
  onMade: (made: ContactResponse) => void
}) {
  const qc = useQueryClient()
  const nameField = useRef<HTMLInputElement>(null)
  const composing = useComposing()
  const rail = useProjectRail()

  const [name, setName] = useState('')
  const [org, setOrg] = useState('')
  const [note, setNote] = useState('')
  const [kind, setKind] = useState<ChannelKind>('email')
  const [address, setAddress] = useState('')
  const [projectIds, setProjects] = useState<string[]>([])

  const projects = useQuery({ queryKey: ['projects'], queryFn: listProjects })
  const make = useMutation({
    mutationFn: createContact,
    onSuccess: async (made) => {
      await qc.invalidateQueries({ queryKey: ['contacts'] })
      onMade(made)
    },
  })

  const ready = name.trim().length > 0
  const submit = () => {
    if (!ready || make.isPending) return
    make.mutate({
      name: name.trim(),
      ...(org.trim() ? { org: org.trim() } : {}),
      ...(note.trim() ? { note: note.trim() } : {}),
      ...(projectIds.length > 0 ? { projectIds } : {}),
      ...(address.trim() ? { channels: [{ kind, value: address.trim(), label: null }] } : {}),
    })
  }

  return (
    <Modal
      title="New contact"
      onClose={onClose}
      initialFocus={nameField}
      dismissLabel={null}
      className="rounded-lg"
    >
      <form
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
        {...composing.bind}
        className="flex flex-col gap-5 px-5 py-4"
      >
        <div>
          <input
            ref={nameField}
            aria-label="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Who is this?"
            onKeyDown={(e) => {
              // isComposing: Enter confirms an IME candidate, it must not submit half a word.
              if (e.key === 'Enter' && !composing.composingNow(e)) {
                e.preventDefault()
                submit()
              }
            }}
            className="w-full rounded-lg bg-transparent py-0.5 text-lg font-semibold text-fg"
          />
        </div>

        <div>
          <label htmlFor="contact-org" className={label}>
            Company
          </label>
          <input
            id="contact-org"
            value={org}
            onChange={(e) => setOrg(e.target.value)}
            className={`${field} mt-1.5`}
          />
        </div>

        {/* ONE address, because one is what you have when you are writing someone down. The rest
            are added on their page, where the list of them belongs. */}
        <div>
          <span className={label}>Contact</span>
          <div className="mt-1.5 flex flex-wrap gap-2">
            <select
              aria-label="Kind"
              value={kind}
              onChange={(e) => setKind(e.target.value as ChannelKind)}
              className="min-w-[6.5rem] rounded-lg border border-border-strong bg-surface px-3 py-2 text-fg"
            >
              {CHANNEL_KINDS.map((k) => (
                <option key={k} value={k}>
                  {KIND_LABEL[k]}
                </option>
              ))}
            </select>
            <input
              aria-label="Address"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className="min-w-[12rem] flex-1 rounded-lg border border-border-strong bg-surface px-3 py-2 text-fg"
            />
          </div>
        </div>

        <div>
          <span className={label}>Projects</span>
          <div className="mt-1.5">
            <PickMany
              label="Projects"
              chosen={projectIds.map((id) => ({
                value: id,
                label: projects.data?.find((p) => p.id === id)?.name ?? '',
                mark: <span className={`h-3.5 w-[3px] shrink-0 rounded-full ${rail(id)}`} />,
              }))}
              choices={(projects.data ?? [])
                .filter((p) => !p.archivedAt)
                .map((p) => ({
                  value: p.id,
                  label: p.name,
                  mark: <span className={`h-3.5 w-[3px] shrink-0 rounded-full ${rail(p.id)}`} />,
                }))}
              onChange={setProjects}
              empty="Not on any project"
            />
          </div>
        </div>

        <div>
          <label htmlFor="contact-note" className={label}>
            Notes
          </label>
          <textarea
            id="contact-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            className={`${field} mt-1.5`}
          />
        </div>

        {make.isError && (
          <p role="alert" className="text-sm text-danger">
            {make.error instanceof Error
              ? make.error.message
              : "Couldn't create it. Your answers are still here — try again."}
          </p>
        )}

        <div className="flex items-center gap-2">
          <button
            type="submit"
            disabled={!ready || make.isPending}
            className="h-9 rounded-lg bg-accent px-3 font-semibold text-accent-fg hover:opacity-90 disabled:opacity-50"
          >
            Create
          </button>
          <button
            type="button"
            onClick={onClose}
            className="h-9 rounded-lg px-3 text-fg-muted hover:bg-surface-hover hover:text-fg"
          >
            Cancel
          </button>
        </div>
      </form>
    </Modal>
  )
}
