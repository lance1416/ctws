import { personId, type ObjectType, type PersonResponse } from '@ctws/contracts'
import { calledBy } from '../logic/calledBy'
import { avatarInitials } from '@ctws/core'
import { useQuery } from '@tanstack/react-query'
import { useRef, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { NoteBody } from '../../../platform/notes/NoteBody'
import { fullDay, MONTHS, weekdayOf } from '../../../platform/time/dates'
import { useNow } from '../../../platform/time/useNow'
import { Avatar } from '../../../platform/ui/Avatar'
import { useColumns } from '../../../platform/ui/columns'
import { BUTTON } from '../../../platform/ui/buttonStyles'
import {
  CakeIcon,
  ContactIcon,
  EditIcon,
  KIND_ICON,
  PlacesIcon,
  RemindIcon,
  type IconComponent,
} from '../../../platform/ui/icons'
import { useTimeZone } from '../../../shell/auth'
import type { PrefetchAt } from '../../../shell/layout'
import { prefetchLinks, useKindBlocks } from '../../../shell/links'
import { ProjectSquare, useEveryProject } from '../../../shell/projects'
import { useRegistry, type Registry } from '../../../shell/registry'
import { prefetchTimeline, Timeline } from '../../../shell/timeline'
import { circlesQuery, peopleQuery } from '../api'
import { usePhone } from '../hooks/usePhone'
import { usePhone as usePhoneFrame } from '../../../platform/ui/phone'
import { PhonePerson } from './PhonePerson'
import { MoreProjects, SHOWN_PROJECTS } from '../components/PersonProjects'
import { byKind, channelHref, channelLabel, KIND_LABEL } from '../logic/channels'
import { LEAD_LABELS } from '../logic/labels'
import { theirTime } from '../logic/localTime'
import { cityAndCountry } from '../logic/places'

/** A birthday this near shows on the head, as the overview's block counts near. */
const SOON_DAYS = 30

const TAG = 'inline-flex h-5.5 items-center gap-1 rounded-control px-2 text-meta font-medium'

/** "Mar 2026", from a role's `YYYY-MM`. */
const monthYear = (month: string) => `${MONTHS[Number(month.slice(5, 7)) - 1]} ${month.slice(0, 4)}`

/**
 * A person's page: who they are and where they work at the head, their profile down the left, and
 * beside it what they are in, a block each, then their timeline.
 */
export function PersonPage({ person }: { person: PersonResponse }) {
  return usePhoneFrame() ? <PhonePerson person={person} /> : <DeskPerson person={person} />
}

/** The kinds of a person's blocks, those of these some module draws. */
const personLinkKinds = (registry: Registry): ObjectType[] =>
  (['meeting', 'task', 'reading'] as const).filter((k) =>
    registry.relations.some((r) => r.type === k),
  )

/**
 * What a person's page reads, started as soon as the session is known: them among everyone, the
 * circles, their blocks' links and each module's things with them, and their timeline, all at once
 * rather than each after the last.
 */
export function prefetchPerson({ qc, params, today, registry }: PrefetchAt): void {
  const parsed = personId.safeParse(params.id)
  if (!parsed.success) return
  const id = parsed.data
  void qc.prefetchQuery(peopleQuery())
  void qc.prefetchQuery(circlesQuery())
  prefetchLinks(qc, { type: 'person', id }, personLinkKinds(registry))
  for (const things of registry.personThings) things.prefetch?.(qc, id, today)
  prefetchTimeline(qc, { type: 'person', id })
}

function DeskPerson({ person }: { person: PersonResponse }) {
  const registry = useRegistry()
  // One hook per module that lists its own things with a person: the registry's list is fixed.
  const owned = registry.personThings.map((t) => ({ kind: t.kind, ...t.useThings(person.id) }))
  const { blocks, full, ready, picker } = useKindBlocks({
    of: { type: 'person', id: person.id },
    kinds: personLinkKinds(registry),
    owned,
    none: (kind) => `None ${kind === 'reading' ? 'from' : 'with'} ${calledBy(person)} yet`,
    titles: { reading: 'Recommended reading' },
    linkedRows: registry.personLinked,
    // Each is made new from here: a meeting with them in it, a task related to them, a book as
    // theirs to recommend.
    creatorFor: (kind) => registry.creates.find((c) => c.kind === kind) ?? null,
    sayAdd: true,
  })
  const profiled = hasProfile(person)
  // As many columns as the blocks' own width holds, three at most, empty blocks counted too. Still
  // being read, the blocks are one bar across.
  const holder = useRef<HTMLDivElement>(null)
  const columns = useColumns(holder)
  const across = ready ? Math.max(1, Math.min(3, columns, blocks.length)) : 1
  // A last full row with a hole in it: its last block takes the rest of the row.
  const rest = full % across === 0 ? 1 : across - (full % across) + 1
  return (
    <div className="flex flex-col gap-4">
      <PersonHead person={person} />
      {/* With nothing to profile, the panel is not drawn and the blocks take the width.
          The widths are ranges that do not overlap: which of two overlapping ones wins is the
          stylesheet's order, not the screen's. */}
      <div
        className={`grid items-start gap-4 ${profiled ? 'lg:max-[1799px]:grid-cols-[20rem_minmax(0,1fr)] min-[1800px]:max-[2199px]:grid-cols-[24rem_minmax(0,1fr)] min-[2200px]:grid-cols-[28rem_minmax(0,1fr)]' : ''}`}
      >
        {profiled && <Profile person={person} />}
        <div className="flex min-w-0 flex-col gap-4">
          {/* The full blocks first, the empty ones after them. Full blocks side by side are as tall
              as each other; an empty one keeps the height of its head. */}
          <div
            ref={holder}
            className="grid gap-3"
            style={{ gridTemplateColumns: `repeat(${across}, minmax(0, 1fr))` }}
          >
            {blocks.map((block, i) => (
              <div
                key={i}
                className={`min-w-0 ${i < full ? 'flex flex-col *:flex-1' : 'self-start'}`}
                style={i === full - 1 && rest > 1 ? { gridColumn: `span ${rest}` } : undefined}
              >
                {block}
              </div>
            ))}
          </div>
          {picker}
          {/* Under the blocks, it waits for them: drawn first, it would be pushed down. */}
          {ready && <Timeline of={{ type: 'person', id: person.id }} filters logs />}
        </div>
      </div>
    </div>
  )
}

function PersonHead({ person }: { person: PersonResponse }) {
  const circles = useQuery(circlesQuery())
  const every = useEveryProject()
  const orgTo = useRegistry().relationFor('organisation').to
  const now = person.roles.filter((r) => r.to === null)
  const theirs = person.circleIds.flatMap((id) => circles.data?.find((c) => c.id === id) ?? [])
  const projects = person.projects.flatMap((p) => every.data?.find((e) => e.id === p.id) ?? [])
  const soon = person.birthday && person.birthday.next.inDays <= SOON_DAYS ? person.birthday : null
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <Avatar initials={avatarInitials(person)} size={56} />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <h1 tabIndex={-1} className="truncate text-title focus:outline-none">
          {person.name}
        </h1>
        <div className="flex flex-wrap items-center gap-1.5 text-ui text-muted">
          {now.map((r) => (
            <span key={r.organisationId} className="inline-flex items-center gap-1.5">
              {r.title && <span>{r.title}</span>}
              <Link
                to={orgTo(r.organisationId)}
                className={`${TAG} bg-organisation-bg text-organisation-t hover:underline max-lg:tap`}
              >
                <KIND_ICON.organisation size={12} aria-hidden="true" />
                {r.organisationName}
              </Link>
            </span>
          ))}
          {theirs.map((c) => (
            <span key={c.id} className={`${TAG} bg-hover text-muted`}>
              {c.name}
            </span>
          ))}
          {soon && (
            <span className={`${TAG} bg-person-bg text-person-t`}>
              <CakeIcon size={12} aria-hidden="true" />
              {soon.next.inDays === 0 ? 'Birthday today' : `Birthday in ${soon.next.inDays} days`}
            </span>
          )}
        </div>
      </div>
      {projects.length > 0 && (
        <span className="flex items-center gap-1 text-meta text-muted">
          In
          {/* The one that moved last first; the rest are "+N". */}
          {projects.slice(0, SHOWN_PROJECTS).map((p) => (
            <Link key={p.id} to={`/projects/${p.id}`} title={p.name}>
              <ProjectSquare project={p} />
            </Link>
          ))}
          {projects.length > SHOWN_PROJECTS && (
            <MoreProjects person={person} more={projects.length - SHOWN_PROJECTS} />
          )}
        </span>
      )}
      <Link to={`/people/${person.id}/edit`} className={BUTTON.secondary}>
        <EditIcon size={16} aria-hidden="true" />
        Edit
      </Link>
    </div>
  )
}

/**
 * The profile: contact, work, places, birthday and notes, each section under its own heading and
 * parted from the next by a line, so they read as separate things, not one list. A section with
 * nothing to say is left out.
 */
function Profile({ person }: { person: PersonResponse }) {
  // Numbers grouped as their country writes them, once the phone module is here.
  const phone = usePhone()
  const region = phone?.currentRegion()
  const now = person.roles.filter((r) => r.to === null)
  const before = person.roles.filter((r) => r.to !== null)
  return (
    <aside
      aria-label="Profile"
      className="flex flex-col divide-y divide-line rounded-container border border-line bg-panel"
    >
      {person.channels.length > 0 && (
        <Section title="Contact" icon={ContactIcon}>
          {/* By kind, email first, as written within a kind; a long address is cut, not wrapped. */}
          {byKind(person.channels).map((c, i) => (
            <Fact key={`${c.kind}-${i}`} name={c.label ?? KIND_LABEL[c.kind]}>
              <a
                href={channelHref(c.kind, c.value)}
                data-channel={c.kind}
                title={c.value}
                className={`block truncate text-ink hover:underline ${c.kind === 'phone' ? 'font-mono' : ''}`}
              >
                {channelLabel(
                  c.kind,
                  c.value,
                  phone ? (v) => phone.formatPhone(v, region) : undefined,
                )}
              </a>
            </Fact>
          ))}
        </Section>
      )}
      {person.roles.length > 0 && (
        <Section title="Work" icon={KIND_ICON.organisation}>
          {now.length > 0 && (
            <Fact name="Now">
              {now.map((r) => (
                <Role
                  key={r.organisationId}
                  role={r}
                  when={r.from ? `Since ${monthYear(r.from)}` : null}
                />
              ))}
            </Fact>
          )}
          {before.length > 0 && (
            <Fact name="Before">
              {before.map((r) => (
                <Role
                  key={`${r.organisationId}-${r.to}`}
                  role={r}
                  when={`${r.from ? `${monthYear(r.from)} to ` : 'To '}${monthYear(r.to!)}`}
                />
              ))}
            </Fact>
          )}
        </Section>
      )}
      <Places person={person} />
      {person.birthday && <Birthday birthday={person.birthday} />}
      {person.note && (
        <Section title="Notes" icon={KIND_ICON.note} prose>
          <div className="text-prose">
            <NoteBody source={person.note} />
          </div>
        </Section>
      )}
    </aside>
  )
}

function Section({
  title,
  icon: Icon,
  prose = false,
  children,
}: {
  title: string
  icon: IconComponent
  /** Running text, not a list of facts. */
  prose?: boolean
  children: ReactNode
}) {
  return (
    <section aria-label={title} className="flex flex-col gap-2.5 p-4">
      <h2 className="flex items-center gap-2 text-head text-ink">
        <Icon size={16} aria-hidden="true" className="text-muted" />
        {title}
      </h2>
      {prose ? (
        <div>{children}</div>
      ) : (
        <dl className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-x-3 gap-y-2 pl-6 text-ui">
          {children}
        </dl>
      )}
    </section>
  )
}

function Fact({ name, children }: { name: string; children: ReactNode }) {
  return (
    <div className="contents">
      {/* Meta's own line, centred on the value's first by its box (h-5 is that line). */}
      <dt className="flex h-5 items-center text-meta text-muted">{name}</dt>
      <dd className="flex min-w-0 flex-col gap-1.5 text-ink">{children}</dd>
    </div>
  )
}

function Role({ role, when }: { role: PersonResponse['roles'][number]; when: string | null }) {
  return (
    <span className="flex flex-col">
      <span>{role.title ? `${role.title}, ${role.organisationName}` : role.organisationName}</span>
      {when && <span className="text-meta text-muted">{when}</span>}
    </span>
  )
}

function Places({ person }: { person: PersonResponse }) {
  const now = useNow()
  const mine = useTimeZone()
  if (!person.city && !person.hometown && !person.timeZone) return null
  return (
    <Section title="Places" icon={PlacesIcon}>
      {person.city && <Fact name="Lives in">{cityAndCountry(person.city)}</Fact>}
      {person.hometown && <Fact name="Hometown">{cityAndCountry(person.hometown)}</Fact>}
      {person.timeZone && <Fact name="Local time">{theirTime(now, person.timeZone, mine)}</Fact>}
    </Section>
  )
}

/** A birthday: the day on a tile, when it falls, and what it is. */
function Birthday({ birthday: b }: { birthday: NonNullable<PersonResponse['birthday']> }) {
  const day = b.next.day
  const when =
    b.next.inDays === 0
      ? 'Today'
      : b.next.inDays === 1
        ? 'Tomorrow'
        : `${weekdayOf(day)}, in ${b.next.inDays} days`
  return (
    <section aria-label="Birthday" className="flex flex-col gap-2.5 p-4">
      <h2 className="flex items-center gap-2 text-head text-ink">
        <CakeIcon size={16} aria-hidden="true" className="text-person" />
        Birthday
      </h2>
      <div className="flex gap-3.5">
        <span
          aria-hidden="true"
          className="flex size-14 shrink-0 flex-col items-center justify-center rounded-container bg-person-bg text-person-t"
        >
          <span className="font-mono text-meta uppercase">
            {MONTHS[Number(day.slice(5, 7)) - 1]}
          </span>
          <span className="text-subject">{Number(day.slice(8, 10))}</span>
        </span>
        <div className="flex min-w-0 flex-col gap-0.5 text-ui">
          <span className="font-medium text-ink">
            {when}
            {/* The date in words for a screen reader, which reads the tile as nothing. */}
            <span className="sr-only">, {fullDay(day)}</span>
          </span>
          {b.calendar === 'lunar' && b.lunarDate && (
            <span className="text-muted">Lunar {b.lunarDate.replace(/^农历/, '')}</span>
          )}
          <span className="flex flex-wrap items-center gap-x-3 text-meta text-muted">
            <span>{b.next.turns === null ? 'Year not known' : `Turns ${b.next.turns}`}</span>
            <span className="inline-flex items-center gap-1">
              <RemindIcon size={12} aria-hidden="true" />
              {LEAD_LABELS[b.remindLead]}
            </span>
          </span>
        </div>
      </div>
    </section>
  )
}

/** Whether there is anything for the profile panel to say. */
function hasProfile(p: PersonResponse): boolean {
  return (
    p.channels.length > 0 ||
    p.roles.length > 0 ||
    Boolean(p.city || p.hometown || p.timeZone || p.birthday || p.note)
  )
}
