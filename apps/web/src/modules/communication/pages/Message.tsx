import { idFrom, communicationId, type CommunicationResponse } from '@ctws/contracts'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { problemText } from '../../../platform/http/api'
import { NoteBody } from '../../../platform/notes/NoteBody'
import { fullDay, ymd } from '../../../platform/time/dates'
import { BUTTON } from '../../../platform/ui/buttonStyles'
import { DangerAction, DangerZone } from '../../../platform/ui/DangerZone'
import {
  CHANNEL_ICON,
  EditIcon,
  FollowUpIcon,
  LinkIcon,
  ReceivedIcon,
  SentIcon,
} from '../../../platform/ui/icons'
import { useAccountToday, useTimeZone } from '../../../shell/auth'
import { DeletedNotice, useDestroy } from '../../../shell/detail'
import { useSubjectOf } from '../../../shell/layout'
import { ProjectSquare, useEveryProject } from '../../../shell/projects'
import { useForgetWhenGone, useRecordRecent } from '../../../shell/search'
import { communicationKeys, deleteMessage, messageQuery } from '../api'
import { AwaitingActions } from '../components/AwaitingActions'
import { CHANNEL_WORDS, LogMessage } from '../components/LogMessage'
import { PartyChip, type Party } from '../components/PartyPicker'
import { followUpChip, followUpTone } from '../logic/followUp'
import { TONE } from './CommunicationOverview'

/** `/communication/:id`: one exchange, read (FR-048), or what happened to it (artboard 23). */
export function Message() {
  const { id = '' } = useParams()
  const message = useQuery({ ...messageQuery(idFrom(communicationId, id)), retry: false })
  const gone = message.isError
  const m = message.data
  useForgetWhenGone('communication', id, gone)
  useSubjectOf(m ? { type: 'communication', id: m.id, title: m.subject ?? 'Message' } : null)
  useRecordRecent(
    m
      ? {
          type: 'communication',
          id: m.id,
          title: m.subject ?? 'Message',
          to: `/communication/${m.id}`,
          kind: 'Communication',
        }
      : null,
  )
  if (gone) return <DeletedNotice type="communication" id={id} />
  if (!m) return null
  return <MessagePage key={m.id} message={m} />
}

function MessagePage({ message: m }: { message: CommunicationResponse }) {
  const today = useAccountToday()
  const timeZone = useTimeZone()
  // Edited where it is shown: open, or asked for by the inspector's Edit (`?edit=1`, I-05).
  const [params, setParams] = useSearchParams()
  const [asked, setAsked] = useState(false)
  const editing = asked || params.get('edit') === '1'
  const setEditing = (on: boolean) => {
    setAsked(on)
    if (!on && params.has('edit'))
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          next.delete('edit')
          return next
        },
        { replace: true },
      )
  }
  const project = useEveryProject().data?.find((p) => p.id === m.projectId)
  const Way = m.direction === 'sent' ? SentIcon : ReceivedIcon
  const Channel = CHANNEL_ICON[m.channel]
  const day = ymd(new Date(m.occurredAt), timeZone)
  const clock = new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone,
  }).format(new Date(m.occurredAt))
  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <div className="flex flex-wrap items-start gap-x-4 gap-y-2">
        <span className="inline-grid size-10 shrink-0 place-items-center rounded-card bg-communication-bg text-communication">
          <Way size={20} aria-hidden="true" />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h1 tabIndex={-1} className="text-title tracking-[-0.02em] focus:outline-none">
            {m.subject ?? 'No subject'}
          </h1>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-meta text-muted">
            <span>{m.direction === 'sent' ? 'Sent' : 'Received'}</span>
            <span className="inline-flex items-center gap-1">
              <Channel size={12} aria-hidden="true" />
              {CHANNEL_WORDS[m.channel]}
            </span>
            <span className="font-mono tabular-nums">
              {fullDay(day)} {clock}
            </span>
            {project && (
              <Link
                to={`/projects/${project.id}`}
                className="inline-flex items-center gap-1.5 max-lg:tap"
              >
                <ProjectSquare project={project} />
                {project.name}
              </Link>
            )}
          </div>
        </div>
        <button type="button" onClick={() => setEditing(true)} className={BUTTON.secondary}>
          <EditIcon size={16} aria-hidden="true" />
          Edit
        </button>
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-meta text-muted">{m.direction === 'sent' ? 'To' : 'From'}</span>
        <div className="flex flex-wrap gap-1.5">
          {m.parties.length === 0 ? (
            <span className="text-ui text-subtle">No one</span>
          ) : (
            m.parties.map((p) => <PartyChip key={`${p.type}:${p.id}`} party={p as Party} />)
          )}
        </div>
      </div>

      {m.awaitingReply && m.followUpOn && (
        <div className="flex flex-wrap items-center gap-3 rounded-block bg-communication-bg px-3.5 py-3">
          <span className="flex-1 text-ui text-ink">Waiting for a reply</span>
          <span
            className={`inline-flex h-6 items-center gap-1 rounded-control px-2 text-meta font-medium ${TONE[followUpTone(m.followUpOn, today)]}`}
          >
            <FollowUpIcon size={12} aria-hidden="true" />
            Follow up {followUpChip(m.followUpOn, today)}
          </span>
          <AwaitingActions message={m} later="pick" />
        </div>
      )}
      {m.repliedBy && (
        <Link to={`/communication/${m.repliedBy}`} className={`${BUTTON.link} self-start`}>
          Replied: see the reply
        </Link>
      )}
      {m.replyTo && (
        <Link to={`/communication/${m.replyTo}`} className={`${BUTTON.link} self-start`}>
          In reply to the message sent
        </Link>
      )}

      {m.body && (
        <div className="rounded-block border border-line bg-panel p-4 text-prose">
          <NoteBody source={m.body} />
        </div>
      )}
      {m.attachments.length > 0 && (
        <ul aria-label="Attached" className="flex flex-wrap gap-1.5">
          {m.attachments.map((url) => (
            <li key={url}>
              {/^https?:\/\//i.test(url) ? (
                <a
                  href={url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex h-7 items-center gap-1.5 rounded-control border border-line px-2 text-meta text-ink hover:bg-hover"
                >
                  <LinkIcon size={12} aria-hidden="true" />
                  {url.replace(/^https?:\/\//i, '')}
                </a>
              ) : (
                <span className="text-meta text-muted">{url}</span>
              )}
            </li>
          ))}
        </ul>
      )}

      <DangerZone>
        <DeleteMessage message={m} />
      </DangerZone>

      {editing && (
        <LogMessage
          what={{ kind: 'edit', message: m }}
          onClose={() => setEditing(false)}
          onDone={() => setEditing(false)}
        />
      )}
    </div>
  )
}

function DeleteMessage({ message: m }: { message: CommunicationResponse }) {
  const navigate = useNavigate()
  const drop = useDestroy({
    type: 'communication',
    id: m.id,
    remove: () => deleteMessage(m.id),
    awaits: [communicationKeys.all],
    onDone: () => navigate('/communication'),
  })
  return (
    <>
      <DangerAction
        label="Delete this message"
        confirmLabel="Delete this message"
        message="Delete this message? It leaves every timeline it is on. The people and organisations it was with stay."
        confirm="Delete this message"
        busy={drop.isPending}
        onConfirm={() => drop.mutate()}
      />
      {drop.isError && (
        <p role="alert" className="text-ui text-stop-t">
          {problemText(drop.error)}
        </p>
      )}
    </>
  )
}
