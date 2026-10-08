import { CHANNEL_KINDS, type ChannelKind, type ContactResponse } from '@ctws/contracts'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, type ReactNode } from 'react'
import { channelHref, deleteContact, patchContact } from '../api/contacts'
import { listProjects } from '../api/projects'
import { useProjectRail } from '../projectColor'
import { DeleteConfirm } from './DeleteConfirm'
import { DetailHead, DetailPane } from './DetailPane'
import { InlineText, PickMany, PickOne } from './inline'

/**
 * ONE PERSON, in the shell's detail pane.
 *
 * This replaces the modal dialog it used to be. Nothing here has a 保存: a company name is typed
 * and committed on leaving the field, a project is added and written, an address is edited and
 * written. The dialog existed because contacts were built last and a form was the quickest thing
 * to write, not because a person is edited differently from a task.
 */

const KIND_LABEL: Record<ChannelKind, string> = { email: '邮箱', phone: '电话', url: '链接' }
const KIND_CHOICES = CHANNEL_KINDS.map((k) => ({ value: k, label: KIND_LABEL[k] }))

export function ContactDetail({
  contact,
  onClose,
}: {
  contact: ContactResponse
  onClose: () => void
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
      onClose()
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
    <DetailPane label="联系人" onClose={onClose}>
      <div className="flex flex-col gap-4">
        <div>
          <DetailHead
            kind={<span className="text-sm text-fg-muted">联系人</span>}
            onClose={onClose}
          />
          <InlineText
            label="姓名"
            value={contact.name}
            placeholder="这个人叫什么"
            onSave={(name) => name && save.mutate({ name })}
            className="mt-0.5 block text-lg font-semibold text-fg"
          />
        </div>

        <div className="flex flex-col gap-2">
          <Field label="公司">
            <InlineText
              label="公司"
              value={contact.org ?? ''}
              placeholder="没有填"
              onSave={(org) => save.mutate({ org: org || null })}
              className="text-sm"
            />
          </Field>
          <Field label="项目" top>
            <PickMany
              label="项目"
              chosen={contact.projects.map((p) => ({
                value: p.id,
                label: p.name,
                mark: chip(p.id),
              }))}
              choices={(projects.data ?? [])
                .filter((p) => !p.archivedAt)
                .map((p) => ({ value: p.id, label: p.name, mark: chip(p.id) }))}
              onChange={(projectIds) => save.mutate({ projectIds })}
              empty="不在任何项目上"
            />
          </Field>
        </div>

        <div>
          <span className="block text-xs text-fg-muted">联系方式</span>
          <ul data-channels className="mt-1 flex flex-col gap-0.5">
            {channels.map((c, i) => (
              <li key={i} className="flex min-w-0 items-center gap-1.5">
                <PickOne
                  label={`第 ${i + 1} 项的类型`}
                  value={c.kind}
                  choices={KIND_CHOICES}
                  onPick={(kind) =>
                    putChannels(channels.map((row, at) => (at === i ? { ...row, kind } : row)))
                  }
                />
                <span className="min-w-0 flex-1">
                  <InlineText
                    label={`第 ${i + 1} 项`}
                    value={c.value}
                    placeholder="地址"
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
                    aria-label={`打开 ${c.value}`}
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
                  aria-label={`删掉第 ${i + 1} 项`}
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
              putChannels([...channels, { kind: 'email', value: '待填', label: null }])
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
            加一项
          </button>
        </div>

        <div>
          <span className="block text-xs text-fg-muted">备注</span>
          <InlineText
            label="备注"
            value={contact.note ?? ''}
            placeholder="还没有备注"
            multiline
            onSave={(note) => save.mutate({ note: note || null })}
            className="mt-1 block max-w-[68ch] text-sm whitespace-pre-wrap text-fg"
          />
        </div>

        <div className="pt-1">
          {deleting ? (
            <DeleteConfirm
              label="确认删除联系人"
              message={`删掉「${contact.name}」？`}
              busy={drop.isPending}
              onConfirm={() => drop.mutate()}
              onCancel={() => setDeleting(false)}
            />
          ) : (
            <button
              type="button"
              onClick={() => setDeleting(true)}
              className="h-9 rounded-lg px-2.5 text-sm text-fg-muted hover:bg-surface-hover hover:text-fg"
            >
              删除联系人
            </button>
          )}
        </div>
      </div>
    </DetailPane>
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
      <span className={`w-10 shrink-0 text-xs text-fg-muted ${top ? 'pt-2' : ''}`}>{label}</span>
      <span className="min-w-0 flex-1">{children}</span>
    </div>
  )
}
