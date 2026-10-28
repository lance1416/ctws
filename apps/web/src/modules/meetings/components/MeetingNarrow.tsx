import { idFrom, meetingId, type MeetingOccurrence } from '@ctws/contracts'
import { avatarInitials } from '@ctws/core'
import { clockTime } from '@ctws/core/clock'
import { useQuery } from '@tanstack/react-query'
import { weekdayDay } from '../../../platform/time/dates'
import { Avatar } from '../../../platform/ui/Avatar'
import { BUTTON } from '../../../platform/ui/buttonStyles'
import { DurationIcon, JoinIcon, KIND_ICON, PlacesIcon } from '../../../platform/ui/icons'
import { KIND_ON_TINT, KIND_TEXT, KIND_TINT } from '../../../platform/ui/kinds'
import { NoteBody } from '../../../platform/notes/NoteBody'
import { useAccountToday, useMe, useTimeZone } from '../../../shell/auth'
import {
  InspectLink,
  NarrowBlocks,
  NarrowHead,
  NarrowRow,
  PropRow,
  PropRows,
} from '../../../shell/inspector'
import { ProjectSquare, useEveryProject } from '../../../shell/projects'
import { Timeline } from '../../../shell/timeline'
import { usePeople } from '../../people'
import { earlierQuery, occurrenceQuery, seriesNotesQuery, seriesQuery } from '../api'
import { MEETINGS_ID } from '../logic/id'
import { lengthLabel } from './MeetingControls'

/** A block's rows before its "All N" (FR-011). */
const SHOWN = 5

const pageOf = (m: MeetingOccurrence) =>
  `/${MEETINGS_ID}/${m.meetingId}?${new URLSearchParams({ at: m.recurrenceId })}`

/**
 * A MEETING IN THE INSPECTOR (FR-022, artboard 33): the occurrence clicked, or else the series'
 * next, or its latest; the date
 * and project under the name; when and where, with Join; who is in it, its notes, the meetings
 * before it in the series, and the latest of its timeline.
 */
export function MeetingNarrow({ id, at }: { id: string; at?: string | undefined }) {
  const today = useAccountToday()
  const zone = useTimeZone()
  // The occurrence clicked, when one was (FR-067); else the series' next, or its latest.
  const one = useQuery({ ...occurrenceQuery(idFrom(meetingId, id), at ?? ''), enabled: !!at })
  const next = useQuery({ ...seriesQuery(idFrom(meetingId, id), today), enabled: !at })
  const found = at ? one : next
  const people = usePeople()
  const me = useMe().data
  const projects = useEveryProject()
  const m = found.data
  const notes = useQuery({ ...seriesNotesQuery(idFrom(meetingId, id)), enabled: !!m })
  const earlier = useQuery({
    ...earlierQuery(idFrom(meetingId, id), m?.startsLocal.slice(0, 10) ?? today),
    enabled: !!m?.rrule,
  })
  if (found.isError || (found.isSuccess && !m))
    return <p className="p-4 text-ui text-muted">This meeting is not here any more.</p>
  if (!m) return null
  const project = m.projectId ? projects.data?.find((p) => p.id === m.projectId) : null
  const starts = new Date(m.startsAt)
  const note = notes.data?.find((n) => n.anchor?.occurrenceId === m.recurrenceId) ?? null
  const before = earlier.data ?? []
  const workplace = (personId: string) =>
    people.data?.find((p) => p.id === personId)?.roles.find((r) => r.to === null)?.organisationName

  return (
    <>
      <NarrowHead
        mark={<KIND_ICON.meeting size={20} aria-hidden="true" className={KIND_TEXT.meeting} />}
        title={m.title}
        tags={
          <>
            <span
              className={`inline-flex h-5.5 items-center rounded-key px-2 font-medium ${KIND_TINT.meeting} ${KIND_ON_TINT.meeting}`}
            >
              {weekdayDay(m.startsLocal.slice(0, 10), today)}
            </span>
            {project && (
              <span className="flex items-center gap-1.5 text-muted">
                <ProjectSquare project={project} />
                {project.name}
              </span>
            )}
          </>
        }
      />
      <PropRows>
        <PropRow icon={DurationIcon} label="When">
          <span className="font-mono tabular-nums">
            {clockTime(starts, zone)}–{clockTime(new Date(m.endsAt), zone)}
          </span>{' '}
          <span className="text-muted">{lengthLabel(m.durationMinutes)}</span>
        </PropRow>
        <PropRow
          icon={PlacesIcon}
          label="Where"
          action={
            m.joinUrl && (
              <a
                href={m.joinUrl}
                target="_blank"
                rel="noreferrer noopener"
                aria-label={`Join ${m.title}`}
                className={`${BUTTON.secondary} h-7 px-2.5 text-meta`}
              >
                <JoinIcon size={14} aria-hidden="true" />
                Join
              </a>
            )
          }
        >
          {m.location}
        </PropRow>
      </PropRows>
      <NarrowBlocks
        blocks={[
          {
            key: 'attending',
            title: 'Attending',
            count: m.attendees.length + 1,
            all:
              m.attendees.length + 1 > SHOWN
                ? { label: `All ${m.attendees.length + 1}`, to: pageOf(m) }
                : null,
            body: (
              <ul className="flex flex-col">
                {m.attendees.slice(0, SHOWN - 1).map((a) => {
                  const person = people.data?.find((p) => p.id === a.id)
                  return (
                    <NarrowRow
                      key={a.id}
                      mark={
                        <Avatar
                          initials={person ? avatarInitials(person) : ([...a.name][0] ?? '?')}
                        />
                      }
                      thing={{ type: 'person', id: a.id }}
                      to={`/people/${a.id}`}
                      title={a.name}
                      fact={workplace(a.id)}
                    />
                  )
                })}
                <li className="grid min-h-8 grid-cols-[20px_minmax(0,1fr)] items-center gap-x-2.5 text-ui text-ink">
                  <Avatar initials={(me?.email.slice(0, 1) ?? '').toLocaleUpperCase()} />
                  You
                </li>
              </ul>
            ),
          },
          {
            key: 'notes',
            title: 'Notes',
            empty: notes.isSuccess && !note ? 'No notes yet.' : null,
            body: note && (
              <div className="line-clamp-6 text-ui">
                <NoteBody source={note.body} />
              </div>
            ),
          },
          !!m.rrule &&
            earlier.isSuccess && {
              key: 'earlier',
              title: 'Earlier in this series',
              count: before.length,
              empty: before.length === 0 ? 'None before this one.' : null,
              all: before.length > SHOWN ? { label: `All ${before.length}`, to: pageOf(m) } : null,
              body: (
                <ul className="flex flex-col">
                  {before.slice(0, SHOWN).map((o) => (
                    <li
                      key={o.recurrenceId}
                      className="grid min-h-8 grid-cols-[20px_minmax(0,1fr)_auto] items-center gap-x-2.5"
                    >
                      <KIND_ICON.note size={14} aria-hidden="true" className={KIND_TEXT.note} />
                      <InspectLink
                        thing={{ type: 'meeting', id: o.meetingId, at: o.recurrenceId }}
                        to={pageOf(o)}
                        className="min-w-0 truncate text-ui text-ink hover:underline"
                      >
                        {o.title}
                      </InspectLink>
                      <span className="font-mono text-meta text-muted tabular-nums">
                        {weekdayDay(o.startsLocal.slice(0, 10), today)}
                      </span>
                    </li>
                  ))}
                </ul>
              ),
            },
          {
            key: 'timeline',
            title: 'Timeline',
            body: (
              <Timeline
                of={{ type: 'meeting', id: m.meetingId }}
                last={5}
                everything={{ label: `Everything with ${m.title}`, to: pageOf(m) }}
              />
            ),
          },
        ]}
      />
    </>
  )
}
