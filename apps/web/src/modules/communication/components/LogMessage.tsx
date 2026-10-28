import {
  CHANNELS,
  FOLLOW_UP_DAYS,
  type Channel,
  type CommunicationResponse,
  type Direction,
  type ProjectId,
} from '@ctws/contracts'
import { addDays } from '@ctws/core/day'
import { useMutation } from '@tanstack/react-query'
import { useId, useState, type ReactNode } from 'react'
import { problemText } from '../../../platform/http/api'
import { keyLabel } from '../../../platform/keyboard/keys'
import { useComposing } from '../../../platform/keyboard/composition'
import { fromDayTimeInput, toDayTimeInput } from '../../../platform/time/dates'
import { useNow } from '../../../platform/time/useNow'
import { BUTTON, ICON_BUTTON, KEY_ON_INK } from '../../../platform/ui/buttonStyles'
import { DetailPane } from '../../../platform/ui/DetailPane'
import { area, boxed, field, label } from '../../../platform/ui/formStyles'
import {
  CHANNEL_ICON,
  CloseIcon,
  DoneIcon,
  KIND_ICON,
  LinkIcon,
  NewIcon,
  ReceivedIcon,
  SentIcon,
} from '../../../platform/ui/icons'
import { UnsavedAsk } from '../../../platform/ui/UnsavedAsk'
import { useUnsavedGuard } from '../../../platform/ui/unsavedGuard'
import { useAccountToday, useTimeZone } from '../../../shell/auth'
import { DayField } from '../../../shell/dates'
import { ProjectPicker } from '../../../shell/projects'
import { communicationKeys, logMessage, logReply, patchMessage } from '../api'
import { PartyChip, PartyPicker, type Party } from './PartyPicker'

/** Each channel's name, on its button's hover and to a screen reader (FR-070). */
export const CHANNEL_WORDS: Record<Channel, string> = {
  email: 'Email',
  call: 'Call',
  message: 'Message',
  in_person: 'In person',
  other: 'Other',
}

/** What the form writes: a new message, the reply to a waiting one, or an edit of one. */
export type LogWhat =
  | { kind: 'new'; parties: Party[]; projectId: ProjectId | null }
  | { kind: 'reply'; to: CommunicationResponse }
  | { kind: 'edit'; message: CommunicationResponse }

type Draft = {
  direction: Direction
  channel: Channel
  parties: Party[]
  subject: string
  when: string
  body: string
  attachments: string[]
  projectId: ProjectId | null
  awaiting: boolean
  followUpOn: string | null
}

const partiesOf = (m: CommunicationResponse): Party[] =>
  m.parties.map((p) =>
    p.type === 'person'
      ? { type: 'person', id: p.id as Extract<Party, { type: 'person' }>['id'], name: p.name }
      : {
          type: 'organisation',
          id: p.id as Extract<Party, { type: 'organisation' }>['id'],
          name: p.name,
        },
  )

function draftOf(what: LogWhat, now: string, zone: string): Draft {
  switch (what.kind) {
    case 'new':
      return {
        direction: 'sent',
        channel: 'email',
        parties: what.parties,
        subject: '',
        when: now,
        body: '',
        attachments: [],
        projectId: what.projectId,
        awaiting: false,
        followUpOn: null,
      }
    case 'reply':
      return {
        direction: 'received',
        channel: what.to.channel,
        parties: partiesOf(what.to),
        subject: what.to.subject ? `Re: ${what.to.subject.replace(/^Re: /i, '')}` : '',
        when: now,
        body: '',
        attachments: [],
        projectId: what.to.projectId,
        awaiting: false,
        followUpOn: null,
      }
    case 'edit': {
      const m = what.message
      return {
        direction: m.direction,
        channel: m.channel,
        parties: partiesOf(m),
        subject: m.subject ?? '',
        when: toDayTimeInput(m.occurredAt, zone),
        body: m.body ?? '',
        attachments: m.attachments,
        projectId: m.projectId,
        awaiting: m.awaitingReply,
        followUpOn: m.followUpOn,
      }
    }
  }
}

const text = (v: string) => (v.trim() === '' ? null : v.trim())

/** A link typed without its scheme is read as https, as a browser's address bar does. */
const asLink = (v: string) => (/^https?:\/\//i.test(v) ? v : `https://${v}`)

/**
 * LOG A MESSAGE (FR-048, FR-070, artboard 14): beside the page it is logged from, sent or
 * received, by which channel, with whom, about what and when, what was said and attached, and
 * whether a reply is awaited by a day. Ctrl Enter logs it from any field. The same form logs the
 * reply to a waiting one, with whom fixed, and edits one.
 */
export function LogMessage({
  what,
  onClose,
  onDone,
}: {
  what: LogWhat
  onClose: () => void
  onDone: (saved: CommunicationResponse) => void
}) {
  const ids = useId()
  const zone = useTimeZone()
  const today = useAccountToday()
  const now = toDayTimeInput(useNow().toISOString(), zone)
  const composing = useComposing()
  const [opened] = useState(() => draftOf(what, now, zone))
  const [d, setDraft] = useState(opened)
  const set = (patch: Partial<Draft>) => setDraft((was) => ({ ...was, ...patch }))
  const [link, setLink] = useState<string | null>(null)
  const [nobody, setNobody] = useState(false)
  const reply = what.kind === 'reply'

  const save = useMutation({
    mutationFn: async (draft: Draft) => {
      const occurredAt = fromDayTimeInput(draft.when, zone) ?? undefined
      const said = {
        channel: draft.channel,
        ...(occurredAt ? { occurredAt } : {}),
        subject: text(draft.subject),
        body: text(draft.body),
        attachments: draft.attachments,
      }
      if (what.kind === 'reply') return logReply(what.to.id, said)
      const waits = draft.direction === 'sent' && draft.awaiting
      const body = {
        ...said,
        direction: draft.direction,
        parties: draft.parties.map((p) => ({ type: p.type, id: p.id })),
        projectId: draft.projectId,
        awaitingReply: waits,
        followUpOn: waits ? draft.followUpOn : null,
      }
      return what.kind === 'edit' ? patchMessage(what.message.id, body) : logMessage(body)
    },
    meta: {
      changes: ['communication', 'person', 'organisation', 'project'],
      awaits: [communicationKeys.all],
      ownsError: true,
    },
    onSuccess: onDone,
  })

  const dirty = JSON.stringify(d) !== JSON.stringify(opened)
  const guard = useUnsavedGuard(dirty && !save.isPending)

  const send = () => {
    if (save.isPending) return
    if (d.parties.length === 0) {
      setNobody(true)
      return
    }
    save.mutate(d)
  }

  const title =
    what.kind === 'reply'
      ? 'Log the reply'
      : what.kind === 'edit'
        ? 'Edit message'
        : 'Log a message'
  const waits = d.direction === 'sent' && d.awaiting

  return (
    <DetailPane label={title} onClose={() => guard.leave(onClose)}>
      <form
        noValidate
        aria-label={title}
        onSubmit={(e) => {
          e.preventDefault()
          send()
        }}
        onKeyDown={(e) => {
          if (e.key !== 'Enter' || !(e.ctrlKey || e.metaKey) || composing.composingNow(e)) return
          e.preventDefault()
          send()
        }}
        className="flex min-h-full flex-col gap-4"
      >
        <div className="flex items-center gap-2">
          <span className="inline-grid size-6 place-items-center rounded-control bg-communication-bg text-communication">
            <KIND_ICON.communication size={14} aria-hidden="true" />
          </span>
          <h2 className="flex-1 text-ui font-medium text-ink">{title}</h2>
          <button
            type="button"
            onClick={() => guard.leave(onClose)}
            aria-label="Close"
            className={ICON_BUTTON}
          >
            <CloseIcon size={16} aria-hidden="true" />
          </button>
        </div>
        <UnsavedAsk guard={guard} />

        <div className="flex flex-wrap items-center gap-2">
          {!reply && (
            <div
              role="radiogroup"
              aria-label="Direction"
              className="inline-flex rounded-control border border-line p-0.5"
            >
              {(['sent', 'received'] as const).map((dir) => {
                const Icon = dir === 'sent' ? SentIcon : ReceivedIcon
                return (
                  <button
                    key={dir}
                    type="button"
                    role="radio"
                    aria-checked={d.direction === dir}
                    onClick={() => set({ direction: dir })}
                    className="inline-flex h-7 items-center gap-1.5 rounded-key px-2.5 text-ui text-muted aria-checked:bg-select aria-checked:font-medium aria-checked:text-ink"
                  >
                    <Icon size={14} aria-hidden="true" />
                    {dir === 'sent' ? 'Sent' : 'Received'}
                  </button>
                )
              })}
            </div>
          )}
          <div
            role="radiogroup"
            aria-label="Channel"
            className="inline-flex rounded-control border border-line p-0.5"
          >
            {CHANNELS.map((c) => {
              const Icon = CHANNEL_ICON[c]
              return (
                <button
                  key={c}
                  type="button"
                  role="radio"
                  aria-checked={d.channel === c}
                  aria-label={CHANNEL_WORDS[c]}
                  title={CHANNEL_WORDS[c]}
                  onClick={() => set({ channel: c })}
                  className="inline-grid h-7 w-8 place-items-center rounded-key text-muted hover:text-ink aria-checked:bg-select aria-checked:text-ink"
                >
                  <Icon size={14} aria-hidden="true" />
                </button>
              )
            })}
          </div>
        </div>

        <Field label={d.direction === 'sent' ? 'To' : 'From'}>
          {reply ? (
            <div className="flex flex-wrap gap-1.5">
              {d.parties.map((p) => (
                <PartyChip key={`${p.type}:${p.id}`} party={p} />
              ))}
            </div>
          ) : (
            <PartyPicker
              label={d.direction === 'sent' ? 'To' : 'From'}
              value={d.parties}
              invalid={nobody}
              onChange={(parties) => {
                setNobody(false)
                set({ parties })
              }}
            />
          )}
          {nobody && (
            <p role="alert" className="text-meta text-stop-t">
              Say who it was {d.direction === 'sent' ? 'to' : 'from'}.
            </p>
          )}
        </Field>

        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
          <div className="flex min-w-0 flex-col gap-1">
            <label htmlFor={`${ids}-subject`} className={label}>
              Subject
            </label>
            <input
              id={`${ids}-subject`}
              value={d.subject}
              autoFocus={what.kind !== 'new' || d.parties.length > 0}
              onChange={(e) => set({ subject: e.target.value })}
              className={field}
            />
          </div>
          <div className="flex min-w-0 flex-col gap-1">
            <span className={label}>When</span>
            {/* The shared date picker for the day, the time beside it (FR-070). */}
            <div className="flex items-center gap-1.5">
              <DayField
                label="When, day"
                value={d.when.slice(0, 10)}
                today={today}
                clearable={false}
                onChange={(day) => day && set({ when: `${day}T${d.when.slice(11, 16)}` })}
              />
              <input
                aria-label="When, time"
                type="time"
                value={d.when.slice(11, 16)}
                onChange={(e) =>
                  e.target.value && set({ when: `${d.when.slice(0, 10)}T${e.target.value}` })
                }
                className={`${boxed} w-24`}
              />
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor={`${ids}-body`} className={label}>
            What was said
          </label>
          <textarea
            id={`${ids}-body`}
            value={d.body}
            rows={4}
            onChange={(e) => set({ body: e.target.value })}
            className={area}
          />
        </div>

        <Field label="Attached">
          <div className="flex flex-wrap items-center gap-1.5">
            {d.attachments.map((url) => (
              <span
                key={url}
                className="inline-flex h-7 max-w-full min-w-0 items-center gap-1.5 rounded-control border border-line pr-1 pl-2 text-meta text-ink"
              >
                <LinkIcon size={12} aria-hidden="true" />
                <span className="truncate">{url.replace(/^https?:\/\//i, '')}</span>
                <button
                  type="button"
                  aria-label={`Remove ${url}`}
                  onClick={() => set({ attachments: d.attachments.filter((a) => a !== url) })}
                  className="inline-grid size-5 place-items-center rounded-key text-muted hover:bg-hover hover:text-ink"
                >
                  <CloseIcon size={12} aria-hidden="true" />
                </button>
              </span>
            ))}
            {link === null ? (
              <button type="button" onClick={() => setLink('')} className={BUTTON.inline}>
                <span className="inline-flex items-center gap-1.5">
                  <NewIcon size={14} aria-hidden="true" />
                  Add a link
                </span>
              </button>
            ) : (
              <input
                aria-label="Link"
                autoFocus
                value={link}
                inputMode="url"
                placeholder="Paste a link, then Enter"
                onChange={(e) => setLink(e.target.value)}
                onKeyDown={(e) => {
                  if (composing.composingNow(e)) return
                  if (e.key === 'Enter' && !(e.ctrlKey || e.metaKey)) {
                    e.preventDefault()
                    const v = link.trim()
                    if (v && !d.attachments.includes(asLink(v)))
                      set({ attachments: [...d.attachments, asLink(v)] })
                    setLink(null)
                  } else if (e.key === 'Escape') {
                    e.preventDefault()
                    setLink(null)
                  }
                }}
                onBlur={() => setLink(null)}
                className={`${boxed} min-w-48 flex-1`}
              />
            )}
          </div>
        </Field>

        {!reply && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Project">
              <ProjectPicker
                value={d.projectId}
                onPick={(projectId) => set({ projectId })}
                none="No project"
              />
            </Field>
            {waits && (
              <div className="flex min-w-0 flex-col gap-1">
                <span className={label}>Follow up on</span>
                <DayField
                  label="Follow up on"
                  value={d.followUpOn}
                  today={today}
                  clearable={false}
                  onChange={(followUpOn) => set({ followUpOn })}
                />
              </div>
            )}
          </div>
        )}

        {!reply && d.direction === 'sent' && (
          <label className="flex items-start gap-3 rounded-block bg-communication-bg px-3.5 py-3">
            <input
              type="checkbox"
              role="switch"
              checked={d.awaiting}
              onChange={(e) =>
                set({
                  awaiting: e.target.checked,
                  // Five days on, unless one was set already (FR-048).
                  followUpOn: d.followUpOn ?? addDays(today, FOLLOW_UP_DAYS),
                })
              }
              className="mt-1 size-4 accent-ink"
            />
            <span className="flex flex-col">
              <span className="text-ui font-medium text-communication-t">Waiting for a reply</span>
              <span className="text-meta text-muted">
                Shows up in Today on the follow-up day if nothing comes back
              </span>
            </span>
          </label>
        )}

        {save.isError && (
          <p role="alert" className="text-ui text-stop-t">
            {problemText(save.error)}
          </p>
        )}

        <div className="mt-auto flex items-center justify-end gap-2 border-t border-line pt-3">
          <button type="button" onClick={() => guard.leave(onClose)} className={BUTTON.quiet}>
            Cancel
          </button>
          <button type="submit" disabled={save.isPending} className={BUTTON.primary}>
            <DoneIcon size={16} aria-hidden="true" />
            {what.kind === 'edit' ? 'Save' : 'Log message'}
            <kbd className={KEY_ON_INK}>{keyLabel('Ctrl Enter')}</kbd>
          </button>
        </div>
      </form>
    </DetailPane>
  )
}

function Field({ label: name, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span className={label}>{name}</span>
      {children}
    </div>
  )
}
