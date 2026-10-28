import { communicationId, idFrom } from '@ctws/contracts'
import { useQuery } from '@tanstack/react-query'
import { NoteBody } from '../../../platform/notes/NoteBody'
import { monthDay, ymd } from '../../../platform/time/dates'
import { Avatar } from '../../../platform/ui/Avatar'
import {
  CHANNEL_ICON,
  FollowUpIcon,
  KIND_ICON,
  ReceivedIcon,
  SentIcon,
} from '../../../platform/ui/icons'
import { KIND_TEXT } from '../../../platform/ui/kinds'
import { useAccountToday, useTimeZone } from '../../../shell/auth'
import { InspectLink, NarrowHead, PropRow, PropRows } from '../../../shell/inspector'
import { ProjectSquare, useEveryProject } from '../../../shell/projects'
import { messageQuery } from '../api'
import { followUpChip, followUpTone } from '../logic/followUp'
import { COMMUNICATION_ID } from '../logic/id'
import { TONE } from '../pages/CommunicationOverview'
import { AwaitingActions } from './AwaitingActions'
import { CHANNEL_WORDS } from './LogMessage'

/** A party's initials from its name: a Chinese name's first character, else first and last words'. */
const initialsOf = (name: string) => {
  const words = name.trim().split(/\s+/)
  const first = [...(words[0] ?? '')][0] ?? ''
  if (/\p{Script=Han}/u.test(first)) return first
  const last = words.length > 1 ? ([...words.at(-1)!][0] ?? '') : ''
  return (first + last).toUpperCase()
}

/**
 * A MESSAGE IN THE INSPECTOR (FR-022, artboard 33): which way it went and its subject; when, and
 * when to follow it up; who it was with, how and in which project; what it said; and, while a
 * reply is awaited, Log the reply and the follow-up's day.
 */
export function MessageNarrow({ id }: { id: string }) {
  const message = useQuery(messageQuery(idFrom(communicationId, id)))
  const today = useAccountToday()
  const zone = useTimeZone()
  const projects = useEveryProject()
  const m = message.data
  if (message.isError)
    return <p className="p-4 text-ui text-muted">This message is not here any more.</p>
  if (!m) return null
  const Way = m.direction === 'sent' ? SentIcon : ReceivedIcon
  const Channel = CHANNEL_ICON[m.channel]
  const project = m.projectId ? projects.data?.find((p) => p.id === m.projectId) : null
  const waiting = m.awaitingReply && m.followUpOn
  return (
    <>
      <NarrowHead
        mark={<Way size={20} aria-hidden="true" className={KIND_TEXT.communication} />}
        title={m.subject ?? 'No subject'}
        tags={
          <>
            <span className="text-muted">
              {m.direction === 'sent' ? 'Sent' : 'Received'}{' '}
              <span className="font-mono tabular-nums">
                {monthDay(ymd(new Date(m.occurredAt), zone))}
              </span>
            </span>
            {waiting && (
              <span
                className={`inline-flex h-5.5 items-center gap-1 rounded-key px-2 font-medium ${TONE[followUpTone(m.followUpOn!, today)]}`}
              >
                <FollowUpIcon size={12} aria-hidden="true" />
                Follow up {followUpChip(m.followUpOn!, today)}
              </span>
            )}
          </>
        }
      />
      <PropRows>
        <PropRow icon={KIND_ICON.person} label={m.direction === 'sent' ? 'To' : 'From'}>
          {m.parties.length > 0 && (
            <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
              {m.parties.map((p) => (
                <InspectLink
                  key={`${p.type}:${p.id}`}
                  thing={{ type: p.type, id: p.id }}
                  to={`/${p.type === 'person' ? 'people' : 'organisations'}/${p.id}`}
                  className="inline-flex items-center gap-1.5 hover:underline"
                >
                  {p.type === 'person' && <Avatar initials={initialsOf(p.name)} />}
                  {p.name}
                </InspectLink>
              ))}
            </span>
          )}
        </PropRow>
        <PropRow icon={Channel} label="Channel">
          {CHANNEL_WORDS[m.channel]}
        </PropRow>
        <PropRow icon={KIND_ICON.project} label="Project">
          {project && (
            <InspectLink
              thing={{ type: 'project', id: project.id }}
              to={`/projects/${project.id}`}
              className="inline-flex items-center gap-1.5 hover:underline"
            >
              <ProjectSquare project={project} />
              {project.name}
            </InspectLink>
          )}
        </PropRow>
      </PropRows>
      {m.body && (
        <div className="border-t border-line px-4 py-3 text-ui">
          <NoteBody source={m.body} />
        </div>
      )}
      {waiting && (
        <div className="flex flex-wrap items-center gap-2 border-t border-line px-4 py-3">
          <AwaitingActions message={m} later="monday" />
        </div>
      )}
      {m.repliedBy && (
        <InspectLink
          thing={{ type: 'communication', id: m.repliedBy }}
          to={`/${COMMUNICATION_ID}/${m.repliedBy}`}
          className="border-t border-line px-4 py-3 text-meta text-muted hover:text-ink"
        >
          Replied: see the reply
        </InspectLink>
      )}
    </>
  )
}
