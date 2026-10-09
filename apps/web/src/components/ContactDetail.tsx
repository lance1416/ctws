import { CHANNEL_KINDS, type ChannelKind, type ContactResponse } from '@ctws/contracts'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, type ReactNode } from 'react'
import { channelHref, deleteContact, patchContact } from '../api/contacts'
import { listProjects } from '../api/projects'
import { useProjectRail } from '../projectColor'
import { DeleteConfirm } from './DeleteConfirm'
import { DetailHead, DetailPane } from './DetailPane'
import { Link } from 'react-router-dom'
import { Links } from './Links'
import { InlineText, PickMany, PickOne } from './inline'

/**
 * ONE PERSON, in the shell's detail pane.
 *
 * This replaces the modal dialog it used to be. Nothing here has a 保存: a company name is typed
 * and committed on leaving the field, a project is added and written, an address is edited and
 * written. The dialog existed because contacts were built last and a form was the quickest thing
 * to write, not because a person is edited differently from a task.
 */

const KIND_LABEL: Record<ChannelKind, string> = { email: 'Email', phone: 'Phone', url: 'Link' }
const KIND_CHOICES = CHANNEL_KINDS.map((k) => ({ value: k, label: KIND_LABEL[k] }))

/**
 * The pane: this module's fields inside the shell's frame.
 *
 * The FIELDS are a component of their own because the person's own page shows the same ones with
 * no frame around them (`relations.Head`). One editor, two places -- a second copy drifts.
 */
export function ContactDetail({
  contact,
  onClose,
}: {
  contact: ContactResponse
  onClose: () => void
}) {
  return (
    <DetailPane label="Contacts" onClose={onClose}>
      <ContactFields contact={contact} onClose={onClose} />
      {/* Linked -- the meetings they are in, what they recommended, the task that came out of a
          call. None of it is written on the person: the edges are, and this reads them from the
          other end. The edges are the SHELL's, so they sit BESIDE this module's fields rather
          than inside them -- the person's own page composes the same two halves. */}
      <div className="mt-4 border-t border-border-subtle pt-3">
        <span className="block px-2 pb-1 text-xs text-fg-muted">Linked</span>
        <Links of={{ type: 'contact', id: contact.id }} />
      </div>
    </DetailPane>
  )
}

export function ContactFields({
  contact,
  onClose,
}: {
  contact: ContactResponse
  /** Where to go when this person is deleted. The page has nowhere to close TO, so it may omit it. */
  onClose?: () => void
}) {
  const qc = useQueryClient()
  const rail = useProjectRail()
  const [deleting, setDeleting] = useState(false)
  const projects = useQuery({ queryKey: ['projects'], queryFn: listProjects })

  const refresh = () => qc.invalidateQueries({ queryKey: ['contacts'] })
  const save = useMutation({
    mutationFn: (patch: Parameters<typeof patchContact>[1]) => patchContact(contact.id, patch),
    onSettled: refresh,
  })
  const drop = useMutation({
    mutationFn: () => deleteContact(contact.id),
    onSuccess: async () => {
      await refresh()
      onClose?.()
    },
  })

  const channels = contact.channels
  // The whole set goes back on every change: the server replaces it, and a person's addresses are
  // one thing you edit, not several you sequence.
  const putChannels = (next: typeof channels) =>
    save.mutate({
      channels: next
        .filter((c) => c.value.trim() !== '')
        .map((c) => ({ kind: c.kind, value: c.value.trim(), label: c.label?.trim() || null })),
    })

  const chip = (id: string) => (
    <span className={`h-3.5 w-[3px] shrink-0 rounded-full ${rail(id)}`} />
  )

  return (
    <div className="flex flex-col gap-4">
      <div>
        {onClose && (
          <DetailHead
            kind={
              <Link
                to={`/contacts/${contact.id}`}
                className="rounded text-sm text-fg-muted hover:text-fg hover:underline"
              >
                Contacts
              </Link>
            }
            onClose={onClose}
          />
        )}
        <InlineText
          label="Name"
          value={contact.name}
          placeholder="Who is this?"
          onSave={(name) => name && save.mutate({ name })}
          className="mt-0.5 block text-lg font-semibold text-fg"
        />
      </div>

      <div className="flex flex-col gap-2">
        <Field label="Company">
          <InlineText
            label="Company"
            value={contact.org ?? ''}
            placeholder="Not set"
            onSave={(org) => save.mutate({ org: org || null })}
            className="text-sm"
          />
        </Field>
        <Field label="Projects" top>
          <PickMany
            label="Projects"
            chosen={contact.projects.map((p) => ({
              value: p.id,
              label: p.name,
              mark: chip(p.id),
            }))}
            choices={(projects.data ?? [])
              .filter((p) => !p.archivedAt)
              .map((p) => ({ value: p.id, label: p.name, mark: chip(p.id) }))}
            onChange={(projectIds) => save.mutate({ projectIds })}
            empty="Not on any project"
          />
        </Field>
      </div>

      <div>
        <span className="block text-xs text-fg-muted">Contact</span>
        <ul data-channels className="mt-1 flex flex-col gap-0.5">
          {channels.map((c, i) => (
            <li key={i} className="flex min-w-0 items-center gap-1.5">
              <PickOne
                label={`Type of item ${i + 1}`}
                value={c.kind}
                choices={KIND_CHOICES}
                onPick={(kind) =>
                  putChannels(channels.map((row, at) => (at === i ? { ...row, kind } : row)))
                }
              />
              <span className="min-w-0 flex-1">
                <InlineText
                  label={`Item ${i + 1}`}
                  value={c.value}
                  placeholder="Address"
                  onSave={(value) =>
                    putChannels(channels.map((row, at) => (at === i ? { ...row, value } : row)))
                  }
                  className="block truncate text-sm text-accent"
                />
              </span>
              {/* The link, beside the value rather than on it: the value has to stay clickable
                    as an EDITOR, so opening it is its own control. */}
              {channelHref(c.kind, c.value) && (
                <a
                  href={channelHref(c.kind, c.value)!}
                  aria-label={`Open ${c.value}`}
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-fg-subtle hover:bg-surface-hover hover:text-fg"
                >
                  <svg aria-hidden="true" viewBox="0 0 16 16" className="h-3.5 w-3.5">
                    <path
                      d="M6.5 3.5h6v6M12.5 3.5l-8 8"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </a>
              )}
              <button
                type="button"
                aria-label={`Remove item ${i + 1}`}
                onClick={() => putChannels(channels.filter((_, at) => at !== i))}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-fg-subtle hover:bg-surface-hover hover:text-fg"
              >
                <svg aria-hidden="true" viewBox="0 0 16 16" className="h-3.5 w-3.5">
                  <path
                    d="M4 4l8 8M12 4l-8 8"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
            </li>
          ))}
        </ul>
        <button
          type="button"
          onClick={() =>
            putChannels([...channels, { kind: 'email', value: 'to fill in', label: null }])
          }
          className="mt-1.5 flex h-8 items-center gap-1.5 rounded-lg border border-dashed border-border-strong px-2.5 text-sm text-fg-muted hover:bg-surface-hover hover:text-fg"
        >
          <svg aria-hidden="true" viewBox="0 0 16 16" className="h-3 w-3">
            <path
              d="M8 3.5v9M3.5 8h9"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
            />
          </svg>
          Add one
        </button>
      </div>

      <div>
        <span className="block text-xs text-fg-muted">Notes</span>
        <InlineText
          label="Notes"
          value={contact.note ?? ''}
          placeholder="No notes yet"
          multiline
          onSave={(note) => save.mutate({ note: note || null })}
          className="mt-1 block max-w-[68ch] text-sm whitespace-pre-wrap text-fg"
        />
      </div>

      {/* SET APART, above a hairline and in the danger colour. It is the only control here that
          cannot be undone, and it used to sit among the others in the same grey. */}
      <div className="mt-2 border-t border-border-subtle pt-3">
        {deleting ? (
          <DeleteConfirm
            label="Confirm deleting this contact"
            message={`Delete “${contact.name}”?`}
            busy={drop.isPending}
            onConfirm={() => drop.mutate()}
            onCancel={() => setDeleting(false)}
          />
        ) : (
          <button
            type="button"
            onClick={() => setDeleting(true)}
            className="h-9 rounded-lg px-2.5 text-sm text-danger hover:bg-danger/10"
          >
            Delete contact
          </button>
        )}
      </div>
    </div>
  )
}

/** A labelled row: the label in a fixed column, so every value starts at one x. */
function Field({
  label,
  top = false,
  children,
}: {
  label: string
  top?: boolean
  children: ReactNode
}) {
  return (
    <div className={`flex gap-2 ${top ? 'items-start' : 'items-center'}`}>
      <span className={`w-20 shrink-0 text-xs text-fg-muted ${top ? 'pt-2' : ''}`}>{label}</span>
      <span className="min-w-0 flex-1">{children}</span>
    </div>
  )
}
