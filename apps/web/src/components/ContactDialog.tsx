import { CHANNEL_KINDS, type ChannelKind, type ContactResponse } from '@ctws/contracts'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import { createContact, deleteContact, patchContact } from '../api/contacts'
import { listProjects } from '../api/projects'
import { useQuery } from '@tanstack/react-query'
import { boxed, field, label } from './formStyles'
import { Modal } from './Modal'

/**
 * MAKING OR EDITING ONE PERSON.
 *
 * A dialog and not a third detail pane: the pane exists because a task is read beside the list it
 * came from, and a contact is not -- you open one to write to them or to change a number, and then
 * you are done. The 新建 dialog is the pattern this app already has for 「做一个东西」.
 *
 * The channel rows are the whole point of the form, so they are the part with room: a person's
 * addresses are added and removed here as a list, which is how vCard models them and how every
 * contact app has edited them for thirty years.
 */

const KIND_LABEL: Record<ChannelKind, string> = { email: '邮箱', phone: '电话', url: '链接' }

type Draft = { kind: ChannelKind; value: string; label: string }

const draftsOf = (contact: ContactResponse | null): Draft[] =>
  contact?.channels.map((c) => ({ kind: c.kind, value: c.value, label: c.label ?? '' })) ?? []

export function ContactDialog({
  contact,
  projectId,
  onClose,
}: {
  /** The person being edited, or null to make a new one. */
  contact: ContactResponse | null
  /** The project a new contact is filed under, when the dialog was opened from one. */
  projectId?: string | undefined
  onClose: () => void
}) {
  const qc = useQueryClient()
  const nameField = useRef<HTMLInputElement>(null)
  const [name, setName] = useState(contact?.name ?? '')
  const [org, setOrg] = useState(contact?.org ?? '')
  const [note, setNote] = useState(contact?.note ?? '')
  const [project, setProject] = useState(contact?.projectId ?? projectId ?? '')
  const [channels, setChannels] = useState<Draft[]>(draftsOf(contact))
  const [error, setError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)
  const projects = useQuery({ queryKey: ['projects'], queryFn: listProjects })

  const refresh = () => qc.invalidateQueries({ queryKey: ['contacts'] })
  const fail = (e: unknown) => setError(e instanceof Error ? e.message : '没能保存')

  const save = useMutation({
    mutationFn: async () => {
      // Empty rows are what a half-filled form leaves behind; they are dropped rather than
      // refused, because an address somebody started typing and abandoned is not an error.
      const kept = channels
        .filter((c) => c.value.trim() !== '')
        .map((c) => ({
          kind: c.kind,
          value: c.value.trim(),
          label: c.label.trim() === '' ? null : c.label.trim(),
        }))
      const body = {
        name: name.trim(),
        org: org.trim() === '' ? null : org.trim(),
        note: note.trim() === '' ? null : note.trim(),
        projectId: project === '' ? null : project,
        channels: kept,
      }
      return contact ? patchContact(contact.id, body) : createContact(body)
    },
    onSuccess: async () => {
      await refresh()
      onClose()
    },
    onError: fail,
  })

  const drop = useMutation({
    mutationFn: () => deleteContact(contact!.id),
    onSuccess: async () => {
      await refresh()
      onClose()
    },
    onError: fail,
  })

  const setChannel = (at: number, next: Partial<Draft>) =>
    setChannels((rows) => rows.map((row, i) => (i === at ? { ...row, ...next } : row)))

  return (
    <Modal
      title={contact ? '编辑联系人' : '新建联系人'}
      onClose={onClose}
      initialFocus={nameField}
      dismissLabel={null}
      className="w-full max-w-lg"
    >
      <form
        className="flex flex-col gap-3 px-4 pt-3 pb-4"
        onSubmit={(e) => {
          e.preventDefault()
          if (name.trim() === '' || save.isPending) return
          save.mutate()
        }}
      >
        <div>
          <label htmlFor="contact-name" className={label}>
            姓名
          </label>
          <input
            id="contact-name"
            ref={nameField}
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={`${field} mt-1`}
          />
        </div>

        <div className="flex gap-3">
          <div className="min-w-0 flex-1">
            <label htmlFor="contact-org" className={label}>
              公司 / 组织
            </label>
            <input
              id="contact-org"
              value={org}
              onChange={(e) => setOrg(e.target.value)}
              className={`${field} mt-1`}
            />
          </div>
          <div className="min-w-0 flex-1">
            <label htmlFor="contact-project" className={label}>
              项目
            </label>
            <select
              id="contact-project"
              value={project}
              onChange={(e) => setProject(e.target.value)}
              className={`${field} mt-1`}
            >
              <option value="">不属于任何项目</option>
              {(projects.data ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <span className={label}>联系方式</span>
          <ul className="mt-1 flex flex-col gap-2">
            {channels.map((row, i) => (
              <li key={i} className="flex items-center gap-2">
                <select
                  value={row.kind}
                  aria-label={`第 ${i + 1} 项的类型`}
                  onChange={(e) => setChannel(i, { kind: e.target.value as ChannelKind })}
                  className={`${boxed} w-20 shrink-0`}
                >
                  {CHANNEL_KINDS.map((k) => (
                    <option key={k} value={k}>
                      {KIND_LABEL[k]}
                    </option>
                  ))}
                </select>
                <input
                  value={row.value}
                  aria-label={`第 ${i + 1} 项`}
                  onChange={(e) => setChannel(i, { value: e.target.value })}
                  className={`${boxed} min-w-0 flex-1`}
                />
                <input
                  value={row.label}
                  aria-label={`第 ${i + 1} 项的说明`}
                  placeholder="说明"
                  onChange={(e) => setChannel(i, { label: e.target.value })}
                  className={`${boxed} w-24 shrink-0`}
                />
                <button
                  type="button"
                  aria-label={`删掉第 ${i + 1} 项`}
                  onClick={() => setChannels((rows) => rows.filter((_, at) => at !== i))}
                  className="h-9 w-8 shrink-0 rounded-lg text-fg-subtle hover:bg-surface-hover hover:text-fg"
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={() =>
              setChannels((rows) => [...rows, { kind: 'email', value: '', label: '' }])
            }
            className="mt-1 -ml-1 rounded-lg px-1 text-sm text-fg-muted hover:text-fg"
          >
            加一项
          </button>
        </div>

        <div>
          <label htmlFor="contact-note" className={label}>
            备注
          </label>
          <textarea
            id="contact-note"
            rows={3}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className={`${field} mt-1 max-w-[68ch]`}
          />
        </div>

        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}

        <div className="flex items-center gap-2">
          <button
            type="submit"
            disabled={name.trim() === '' || save.isPending}
            className="h-9 rounded-lg bg-accent px-3 text-sm font-semibold text-on-accent disabled:opacity-50"
          >
            保存
          </button>
          <button
            type="button"
            onClick={onClose}
            className="h-9 rounded-lg border border-border-strong px-3 text-sm text-fg hover:bg-surface-hover"
          >
            取消
          </button>
          {/* Quieter than 保存 and behind a question, like every other destructive control here. */}
          {contact && (
            <span className="ml-auto">
              {confirming ? (
                <span
                  role="alertdialog"
                  aria-label="确认删除联系人"
                  className="flex items-center gap-2"
                >
                  <span className="text-sm text-fg">删掉「{contact.name}」？</span>
                  <button
                    type="button"
                    onClick={() => drop.mutate()}
                    className="h-9 rounded-lg border border-danger px-2.5 text-sm text-danger"
                  >
                    删除
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirming(false)}
                    className="h-9 rounded-lg px-2 text-sm text-fg-muted hover:text-fg"
                  >
                    取消
                  </button>
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirming(true)}
                  className="h-9 rounded-lg px-2.5 text-sm text-fg-muted hover:text-fg"
                >
                  删除联系人
                </button>
              )}
            </span>
          )}
        </div>
      </form>
    </Modal>
  )
}
