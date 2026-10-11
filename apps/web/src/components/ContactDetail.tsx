import { CHANNEL_KINDS, type ChannelKind, type ContactResponse } from '@ctws/contracts'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { channelHref, deleteContact, patchContact } from '../api/contacts'
import { listProjects } from '../api/projects'
import { useProjectRail } from '../projectColor'
import { DangerAction } from './DangerZone'
import { useState } from 'react'
import { BirthdayFields } from './BirthdayFields'
import { CIRCLE_LABELS } from './BirthdayRow'
import { BUTTON } from './buttonStyles'
import { Field } from './Field'
import { NoteBody } from '../notes/NoteBody'
import { WritingMode } from '../notes/WritingMode'
import { DetailHead, DetailPane } from './DetailPane'
import { Link } from 'react-router-dom'
import { Links } from './Links'
import { InlineText, PickMany, PickOne } from './inline'

/**
 * ONE PERSON, in the shell's detail pane.
 *
 * NOTHING HERE HAS A SAVE, as nowhere else in the pane does: a company name is typed and
 * committed on leaving the field, a project is added and written, an address is edited and
 * written. A person is not edited differently from a task.
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
      {/* 删一个人不在这里：面板是随手点开、随手关掉的东西，而删除不可撤销。它在这个人自己那一页
          的最底下（`ObjectPage` 的危险区），底下再没有别的控件可以划过去碰到。 */}
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
  const [writing, setWriting] = useState(false)
  const rail = useProjectRail()
  const projects = useQuery({ queryKey: ['projects'], queryFn: listProjects })

  const refresh = () => qc.invalidateQueries({ queryKey: ['contacts'] })
  const save = useMutation({
    mutationFn: (patch: Parameters<typeof patchContact>[1]) => patchContact(contact.id, patch),
    onSettled: refresh,
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
            // 面包屑回列表，像面包屑那样；整页打开是它自己的控件，不是一个伪装成返回的链接。
            kind={
              <Link
                to="/contacts"
                className="rounded text-sm text-fg-muted hover:text-fg hover:underline"
              >
                Contacts
              </Link>
            }
            trailing={
              <Link
                to={`/contacts/${contact.id}`}
                aria-label="Open as a page"
                title="Open as a page"
                className="flex h-9 w-9 items-center justify-center rounded-lg text-fg-muted hover:bg-surface-hover hover:text-fg"
              >
                <svg aria-hidden="true" viewBox="0 0 16 16" className="h-4 w-4">
                  <path
                    d="M6.5 3.5h6v6M12.5 3.5l-8 8"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </Link>
            }
            onClose={onClose}
          />
        )}
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <InlineText
              label="Name"
              value={contact.name}
              placeholder="Who is this?"
              onSave={(name) => name && save.mutate({ name })}
              className="mt-0.5 block text-lg font-semibold text-fg"
            />
            {/* 读出来的一行，不是第二个编辑器：改还是在下面那两格里改。 */}
            {(contact.title || contact.org) && (
              <p className="truncate text-sm text-fg-muted">
                {[contact.title, contact.org].filter(Boolean).join(' · ')}
              </p>
            )}
          </div>
          {contact.circle && (
            <span className="shrink-0 rounded-full border border-border-subtle bg-surface-raised px-2.5 py-1 text-xs text-fg-muted">
              {CIRCLE_LABELS[contact.circle]}
            </span>
          )}
        </div>
      </div>

      {/*
        先是怎么找到这个人 —— 一张联系人页存在的理由就是这个，所以它排在所有字段前面。
      */}
      <Field label="Contact" shape="above">
        <ul data-channels className="flex flex-col gap-0.5">
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
      </Field>

      {/*
        其余字段，标签在值上面，一格一件事。

        列数看这一块自己有多宽（`@container`，不是 `sm:`）：同一块东西要在 310px 的详情面板里、
        在三栏的中栏里、在整页上各渲染一次，窗口宽不代表这里宽。

        生日只是其中一格，和「家乡」一样宽、一样响：农历、生肖、星座、时辰、下一次、提前量都在
        点开之后（`BirthdayFields`），因为认一个人不需要它们。
      */}
      <div className="@container">
        <div
          data-contact-fields
          className="grid items-start gap-x-6 gap-y-4 @xl:grid-cols-2 @2xl:grid-cols-3"
        >
          <BirthdayFields contact={contact} onSave={(patch) => save.mutate(patch)} />
          <Field label="Hometown" shape="above">
            <InlineText
              label="Hometown"
              value={contact.hometown ?? ''}
              placeholder="Not set"
              onSave={(hometown) => save.mutate({ hometown: hometown || null })}
              className="block truncate text-sm"
            />
          </Field>
          <Field label="Lives in" shape="above">
            <InlineText
              label="Lives in"
              value={contact.city ?? ''}
              placeholder="Not set"
              onSave={(city) => save.mutate({ city: city || null })}
              className="block truncate text-sm"
            />
          </Field>
          <Field label="Company" shape="above">
            <InlineText
              label="Company"
              value={contact.org ?? ''}
              placeholder="Not set"
              onSave={(org) => save.mutate({ org: org || null })}
              className="block truncate text-sm"
            />
          </Field>
          <Field label="Title" shape="above">
            <InlineText
              label="Title"
              value={contact.title ?? ''}
              placeholder="Not set"
              onSave={(title) => save.mutate({ title: title || null })}
              className="block truncate text-sm"
            />
          </Field>
          <Field label="Gender" shape="above">
            <PickOne
              label="Gender"
              value={contact.gender ?? ''}
              choices={[
                { value: '', label: 'Not set' },
                { value: 'female', label: 'Female' },
                { value: 'male', label: 'Male' },
                { value: 'other', label: 'Other' },
              ]}
              onPick={(gender) => save.mutate({ gender: (gender || null) as 'male' | null })}
            />
          </Field>
          <Field label="Circle" shape="above">
            <PickOne
              label="Circle"
              value={contact.circle ?? ''}
              choices={[
                { value: '', label: 'Not set' },
                { value: 'family', label: 'Family' },
                { value: 'friend', label: 'Friends' },
                { value: 'work', label: 'Work' },
              ]}
              onPick={(circle) => save.mutate({ circle: (circle || null) as 'family' | null })}
            />
          </Field>
          <Field label="Projects" shape="above">
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
      </div>

      {/*
        THE NOTE, RENDERED AS MARKDOWN -- the same pipeline a task's note goes through, down to
        the 68ch reading measure. Nothing is added to the bundle by this: `NoteBody` is already
        behind a dynamic import, so a person whose note nobody opens costs nothing.
      */}
      <Field label="Notes" shape="above">
        <div data-contact-notes className="max-w-[68ch] text-fg">
          {contact.note ? (
            <NoteBody source={contact.note} />
          ) : (
            <p className="text-sm text-fg-subtle">No notes yet</p>
          )}
        </div>
        <button
          type="button"
          className={`-ml-2.5 mt-1 ${BUTTON.quiet}`}
          onClick={() => setWriting(true)}
        >
          Write
        </button>
      </Field>
      {writing && (
        <WritingMode
          heading={contact.name}
          source={contact.note ?? ''}
          onChange={(next) => save.mutate({ note: next.trim() === '' ? null : next })}
          onClose={() => setWriting(false)}
        />
      )}
    </div>
  )
}

/**
 * DESTROYING THIS PERSON, for whichever surface is showing them.
 *
 * Exported on its own rather than drawn at the end of the fields above, because WHERE it goes is
 * the surface's to decide and it is the same answer every time: last, under a rule (`DangerZone`).
 * The fields are also shown on the object page, which has panels of its own below them -- a delete
 * drawn inside the fields would land in the middle of that page.
 */
export function DeleteContact({
  contact,
  onDeleted,
}: {
  contact: ContactResponse
  onDeleted?: () => void
}) {
  const qc = useQueryClient()
  const drop = useMutation({
    mutationFn: () => deleteContact(contact.id),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['contacts'] })
      onDeleted?.()
    },
  })
  return (
    <DangerAction
      label="Delete contact"
      confirmLabel="Confirm deleting this contact"
      message={`Delete “${contact.name}”? This cannot be undone.`}
      busy={drop.isPending}
      onConfirm={() => drop.mutate()}
    />
  )
}
