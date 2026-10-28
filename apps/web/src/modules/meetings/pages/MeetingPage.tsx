import type { MeetingOccurrence } from '@ctws/contracts'
import { clockTime } from '@ctws/core/clock'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useState, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { problemText } from '../../../platform/http/api'
import { shortDay, weekdayOf } from '../../../platform/time/dates'
import { BUTTON, ICON_BUTTON } from '../../../platform/ui/buttonStyles'
import {
  DurationIcon,
  EditIcon,
  JoinIcon,
  KIND_ICON,
  MoreIcon,
  PlacesIcon,
  RepeatIcon,
  type IconComponent,
} from '../../../platform/ui/icons'
import { MENU_ITEM, MENU_SURFACE } from '../../../platform/ui/menuSurface'
import { useAccountToday, useTimeZone } from '../../../shell/auth'
import { useKindBlocks } from '../../../shell/links'
import { ProjectSquare, useEveryProject } from '../../../shell/projects'
import { useRegistry } from '../../../shell/registry'
import { usePeople } from '../../people'
import { cancelMeeting, earlierQuery, meetingKeys, repeatLabel } from '../api'
import { Attending } from '../components/Attending'
import { EarlierInSeries, occurrenceTo } from '../components/EarlierInSeries'
import { OccurrenceNotes } from '../components/OccurrenceNotes'
import { ScopeChoice } from '../components/ScopeChoice'
import { meetingLink } from '../logic/meetingPlace'
import { MEETINGS_ID } from '../logic/id'

const TAG = 'inline-flex h-5.5 items-center gap-1 rounded-control px-2 text-meta font-medium'

/** Where an occurrence is edited, and how far the edit reaches. */
const editTo = (m: MeetingOccurrence, scope: string) =>
  `/${MEETINGS_ID}/${m.meetingId}/edit?${new URLSearchParams({ at: m.recurrenceId, scope })}`

/**
 * A MEETING'S PAGE (FR-067, artboards 16 and 17): one occurrence, named and dated at the head with
 * how it repeats and its project, Join and Edit; down the left when it is on your clock and theirs,
 * where, and who is in it; in the middle this occurrence's notes, then the series' earlier ones;
 * on the right the tasks made from these meetings.
 */
export function MeetingPage({
  meeting: m,
  writing,
}: {
  meeting: MeetingOccurrence
  /** Opened from "Write": straight into this occurrence's notes (FR-066). */
  writing: boolean
}) {
  const registry = useRegistry()
  const { blocks, picker } = useKindBlocks({
    of: { type: 'meeting', id: m.meetingId },
    kinds: (['task'] as const).filter((k) => registry.relations.some((r) => r.type === k)),
    owned: [],
    titles: { task: 'Tasks from these meetings' },
    none: () => 'None yet',
    linkedRows: registry.personLinked,
    creatorFor: (kind) => registry.creates.find((c) => c.kind === kind) ?? null,
    sayAdd: true,
  })
  return (
    <div className="flex flex-col gap-4">
      <MeetingHead meeting={m} />
      <div className="grid items-start gap-4 lg:grid-cols-[16.5rem_minmax(0,1fr)] 2xl:grid-cols-[16.5rem_minmax(0,1fr)_20rem]">
        <Profile meeting={m} />
        <div className="flex min-w-0 flex-col gap-4">
          <OccurrenceNotes key={m.recurrenceId} meeting={m} writing={writing} />
          <EarlierInSeries meeting={m} />
        </div>
        <div className="flex min-w-0 flex-col gap-4 lg:col-start-2 2xl:col-start-auto">
          {blocks}
          {picker}
        </div>
      </div>
    </div>
  )
}

function MeetingHead({ meeting: m }: { meeting: MeetingOccurrence }) {
  const today = useAccountToday()
  const navigate = useNavigate()
  const project = useEveryProject().data?.find((p) => p.id === m.projectId)
  const earlier = useQuery({
    ...earlierQuery(m.meetingId, m.startsLocal.slice(0, 10)),
    enabled: m.rrule !== null,
  })
  const [asking, setAsking] = useState(false)
  const day = m.startsLocal.slice(0, 10)
  const join = m.joinUrl ?? meetingLink(m.location)
  const firstDay = (earlier.data?.at(-1) ?? m).startsLocal.slice(0, 10)
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <span
        aria-hidden="true"
        className="inline-grid size-14 shrink-0 place-items-center rounded-card bg-meeting-bg text-meeting"
      >
        <KIND_ICON.meeting size={24} />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <h1 tabIndex={-1} className="truncate text-title tracking-[-0.02em] focus:outline-none">
          {m.title}
        </h1>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className={`${TAG} bg-meeting-bg text-meeting-t`}>
            {weekdayOf(day, true)}, {shortDay(day, today)}
          </span>
          {m.rrule && (
            <span className={`${TAG} bg-hover text-muted`}>
              <RepeatIcon size={12} aria-hidden="true" />
              {repeatLabel(m.rrule, m.startsLocal, today)}
            </span>
          )}
          {project && (
            <Link
              to={`/projects/${project.id}`}
              className="inline-flex items-center gap-1.5 text-ui text-muted hover:text-ink"
            >
              <ProjectSquare project={project} />
              {project.name}
            </Link>
          )}
        </div>
      </div>
      {join && (
        <a href={join} target="_blank" rel="noreferrer" className={BUTTON.primary}>
          <JoinIcon size={16} aria-hidden="true" />
          Join
        </a>
      )}
      <div className="relative">
        {m.rrule ? (
          <button
            type="button"
            aria-expanded={asking}
            onClick={() => setAsking(!asking)}
            className={BUTTON.secondary}
          >
            <EditIcon size={16} aria-hidden="true" />
            Edit
          </button>
        ) : (
          <Link to={editTo(m, 'all')} className={BUTTON.secondary}>
            <EditIcon size={16} aria-hidden="true" />
            Edit
          </Link>
        )}
        {asking && (
          <ScopeChoice
            meeting={m}
            firstDay={firstDay}
            onPick={(scope) => navigate(editTo(m, scope))}
            onCancel={() => setAsking(false)}
          />
        )}
      </div>
      {m.rrule && <More meeting={m} />}
    </div>
  )
}

/**
 * What else can be done to one occurrence (FR-068): cancel it. It can be taken back: the page it
 * leaves says so, with the way to. Deleting the whole series is on its edit page.
 */
function More({ meeting: m }: { meeting: MeetingOccurrence }) {
  const navigate = useNavigate()
  const cancel = useMutation({
    mutationFn: () => cancelMeeting(m.meetingId, 'one', m.recurrenceId),
    meta: { changes: ['meeting'], awaits: [meetingKeys.all], ownsError: true },
    onSuccess: () => navigate(`${occurrenceTo(m)}&cancelled=1`, { replace: true }),
  })
  return (
    <>
      <DropdownMenu.Root modal={false}>
        <DropdownMenu.Trigger aria-label="More" title="More" className={ICON_BUTTON}>
          <MoreIcon size={16} aria-hidden="true" />
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content align="end" sideOffset={4} className={MENU_SURFACE}>
            <DropdownMenu.Item onSelect={() => cancel.mutate()} className={MENU_ITEM}>
              Cancel this one
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
      {cancel.isError && (
        <p role="alert" className="w-full text-ui text-stop-t">
          {problemText(cancel.error)}
        </p>
      )}
    </>
  )
}

/** When (on your clock, then on each other clock in the room), where, and who (FR-067). */
function Profile({ meeting: m }: { meeting: MeetingOccurrence }) {
  const zone = useTimeZone()
  const people = usePeople()
  const start = new Date(m.startsAt)
  const end = new Date(m.endsAt)
  const span = (z: string) => `${clockTime(start, z)} to ${clockTime(end, z)}`
  // Each other zone someone in it keeps time in, and whose it is (FR-067).
  const elsewhere = new Map<string, string[]>()
  for (const a of m.attendees) {
    const p = people.data?.find((x) => x.id === a.id)
    if (p?.timeZone && p.timeZone !== zone)
      elsewhere.set(p.timeZone, [...(elsewhere.get(p.timeZone) ?? []), p.givenName])
  }
  const link = m.joinUrl ?? meetingLink(m.location)
  return (
    <aside
      aria-label="Profile"
      className="flex flex-col gap-5 rounded-block border border-line bg-panel p-4"
    >
      <Section title="When" icon={DurationIcon}>
        <div className="flex flex-col gap-2.5 pl-6">
          <Clock span={span(zone)} where={zone} />
          {[...elsewhere].map(([z, names]) => (
            <Clock
              key={z}
              span={span(z)}
              where={`${z.split('/').pop()!.replace(/_/g, ' ')}, for ${names.join(', ')}`}
            />
          ))}
        </div>
      </Section>
      {(m.location || link) && (
        <Section title="Where" icon={PlacesIcon}>
          <div className="flex flex-col gap-1 pl-6 text-ui">
            {m.location && !meetingLink(m.location) && (
              <span className="text-ink">{m.location}</span>
            )}
            {link && (
              <a
                href={link}
                target="_blank"
                rel="noreferrer"
                className="truncate text-ink hover:underline"
              >
                {link.replace(/^https?:\/\//i, '')}
              </a>
            )}
          </div>
        </Section>
      )}
      <Attending meeting={m} />
    </aside>
  )
}

function Clock({ span, where }: { span: string; where: string }) {
  return (
    <span className="flex flex-col">
      <span className="font-mono text-ui text-ink tabular-nums">{span}</span>
      <span className="text-meta text-muted">{where}</span>
    </span>
  )
}

function Section({
  title,
  icon: Icon,
  children,
}: {
  title: string
  icon: IconComponent
  children: ReactNode
}) {
  return (
    <section aria-label={title} className="flex flex-col gap-2.5">
      <h2 className="flex items-center gap-2 text-ui font-medium text-ink">
        <Icon size={16} aria-hidden="true" className="text-muted" />
        {title}
      </h2>
      {children}
    </section>
  )
}
