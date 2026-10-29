import type { PersonResponse } from '@ctws/contracts'
import { calledBy } from '../logic/calledBy'
import { avatarInitials } from '@ctws/core'
import { useQuery } from '@tanstack/react-query'
import { useState, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { NoteBody } from '../../../platform/notes/NoteBody'
import { MONTHS, weekdayOf } from '../../../platform/time/dates'
import { useNow } from '../../../platform/time/useNow'
import { Avatar } from '../../../platform/ui/Avatar'
import { BottomSheet } from '../../../platform/ui/BottomSheet'
import { ICON_BUTTON } from '../../../platform/ui/buttonStyles'
import {
  BackIcon,
  CakeIcon,
  CHANNEL_ICON,
  CirclesIcon,
  EditIcon,
  KIND_ICON,
  MoreIcon,
  TimeZoneIcon,
  type IconComponent,
} from '../../../platform/ui/icons'
import { useTimeZone } from '../../../shell/auth'
import { useKindBlocks } from '../../../shell/links'
import { useRegistry } from '../../../shell/registry'
import { Timeline } from '../../../shell/timeline'
import { circlesQuery } from '../api'
import { DeletePerson } from '../components/DeletePerson'
import { usePhone as usePhoneNumbers } from '../hooks/usePhone'
import { byKind, channelHref, channelLabel, KIND_LABEL } from '../logic/channels'
import { timeApart } from '../logic/localTime'
import { cityAndCountry } from '../logic/places'

const monthYear = (month: string) => `${MONTHS[Number(month.slice(5, 7)) - 1]} ${month.slice(0, 4)}`

/**
 * A PERSON ON A PHONE (FR-087, artboard 26): back to People, Edit and "…" above; who they are and
 * where they work; Call, Message and Email a tap each; a card of what matters now (their clock,
 * their birthday, their number, their circles); then what was said lately, the rest of their
 * profile under "More about", and what they are in.
 */
export function PhonePerson({ person }: { person: PersonResponse }) {
  const registry = useRegistry()
  const navigate = useNavigate()
  const [more, setMore] = useState(false)
  const circles = useQuery(circlesQuery())
  const numbers = usePhoneNumbers()
  const region = numbers?.currentRegion()
  const now = useNow()
  const mine = useTimeZone()
  const owned = registry.personThings.map((t) => ({ kind: t.kind, ...t.useThings(person.id) }))
  const { blocks, picker } = useKindBlocks({
    of: { type: 'person', id: person.id },
    kinds: (['meeting', 'task', 'reading'] as const).filter((k) =>
      registry.relations.some((r) => r.type === k),
    ),
    owned,
    none: (kind) => `None ${kind === 'reading' ? 'from' : 'with'} ${calledBy(person)} yet`,
    titles: { reading: 'Recommended reading' },
    linkedRows: registry.personLinked,
    creatorFor: (kind) => registry.creates.find((c) => c.kind === kind) ?? null,
    sayAdd: true,
  })
  const working = person.roles.filter((r) => r.to === null)
  const before = person.roles.filter((r) => r.to !== null)
  const channels = byKind(person.channels)
  const phone = channels.find((c) => c.kind === 'phone')
  const email = channels.find((c) => c.kind === 'email')
  const theirs = person.circleIds.flatMap((id) => circles.data?.find((c) => c.id === id) ?? [])
  const apart = person.timeZone ? timeApart(now, person.timeZone, mine) : null
  const city = person.city ? person.city.split(', ')[0] : null
  const b = person.birthday
  const card = Boolean(apart || b || phone || theirs.length > 0)
  // Every way to reach them past the first number and address, the buttons' (links, others).
  const others = channels.filter((c) => c !== phone && c !== email)
  const moreAbout = Boolean(
    person.city || person.hometown || before.length > 0 || person.note || others.length > 0,
  )
  const called = calledBy(person)
  const say = (value: string) =>
    channelLabel('phone', value, numbers ? (v) => numbers.formatPhone(v, region) : undefined)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex min-h-11 items-center gap-1 lg:hidden">
        <Link
          to="/people"
          className="-ml-1 flex min-h-11 flex-1 items-center gap-1 text-prose text-task-t"
        >
          <BackIcon size={20} aria-hidden="true" />
          People
        </Link>
        <Link
          to={`/people/${person.id}/edit`}
          aria-label="Edit"
          className={`${ICON_BUTTON} size-11`}
        >
          <EditIcon size={20} aria-hidden="true" />
        </Link>
        <button
          type="button"
          onClick={() => setMore(true)}
          aria-label="More"
          className={`${ICON_BUTTON} size-11`}
        >
          <MoreIcon size={20} aria-hidden="true" />
        </button>
      </div>

      <header className="flex flex-col gap-2">
        <div className="flex items-center gap-3.5">
          <Avatar initials={avatarInitials(person)} size={56} />
          <div className="flex min-w-0 flex-col">
            <h1 tabIndex={-1} className="truncate text-title text-ink focus:outline-none">
              {person.name}
            </h1>
            {person.aliases.length > 0 && (
              <span className="truncate text-prose text-muted">
                {person.aliases.map((a) => a.name).join(', ')}
              </span>
            )}
          </div>
        </div>
        {working.map((r) => (
          <span key={r.organisationId} className="flex items-center gap-1.5 text-prose text-muted">
            <KIND_ICON.organisation size={16} aria-hidden="true" className="text-organisation" />
            {r.title && <span>{r.title}</span>}
            <Link
              to={registry.relationFor('organisation').to(r.organisationId)}
              className="font-medium text-organisation-t max-lg:tap"
            >
              {r.organisationName}
            </Link>
          </span>
        ))}
      </header>

      <div className="grid grid-cols-3 gap-2.5">
        <Reach
          icon={CHANNEL_ICON.call}
          label="Call"
          href={phone ? channelHref('phone', phone.value) : null}
        />
        <Reach
          icon={CHANNEL_ICON.message}
          label="Message"
          href={phone ? `sms:${phone.value.replace(/[\s-]/g, '')}` : null}
        />
        <Reach
          icon={CHANNEL_ICON.email}
          label="Email"
          href={email ? channelHref('email', email.value) : null}
        />
      </div>

      {card && (
        <ul aria-label="Profile" className="rounded-phone-card border border-line bg-panel py-1">
          {apart && (
            <Line icon={TimeZoneIcon}>
              <span className="text-prose text-ink">
                {apart.clock}
                {city && ` in ${city}`}
              </span>
              <span className="text-ui text-muted">{apart.apart}</span>
            </Line>
          )}
          {b && (
            <Line
              icon={CakeIcon}
              tone="text-person"
              trail={
                <span className="inline-flex h-6 items-center rounded-control bg-person-bg px-2 text-ui font-medium text-person-t">
                  {b.next.inDays === 0 ? 'Today' : `in ${b.next.inDays} days`}
                </span>
              }
            >
              <span className="text-prose text-ink">
                {weekdayOf(b.next.day, true)}, {MONTHS[Number(b.next.day.slice(5, 7)) - 1]}{' '}
                {Number(b.next.day.slice(8, 10))}
              </span>
              {b.lunarDate && (
                <span className="text-ui text-muted">{b.lunarDate.replace(/^农历/, '')}</span>
              )}
            </Line>
          )}
          {phone && (
            <Line icon={CHANNEL_ICON.call}>
              <a
                href={channelHref('phone', phone.value)}
                className="flex min-h-11 items-center font-mono text-prose text-ink"
              >
                {say(phone.value)}
              </a>
            </Line>
          )}
          {theirs.length > 0 && (
            <Line icon={CirclesIcon}>
              <span className="flex flex-wrap gap-1.5">
                {theirs.map((c) => (
                  <span
                    key={c.id}
                    className="inline-flex h-6.5 items-center rounded-control bg-hover px-2.5 text-ui text-muted"
                  >
                    {c.name}
                  </span>
                ))}
              </span>
            </Line>
          )}
        </ul>
      )}

      <Timeline of={{ type: 'person', id: person.id }} filters logs />

      {moreAbout && (
        <section aria-label={`More about ${called}`} className="flex flex-col gap-1.5">
          <h2 className="px-1 text-ui font-medium text-muted">More about {called}</h2>
          <dl className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-x-3 gap-y-2.5 rounded-phone-card border border-line bg-panel p-3.5 text-prose">
            {others.map((c, i) => (
              <Fact key={`${c.kind}-${i}`} name={c.label ?? KIND_LABEL[c.kind]}>
                <a
                  href={channelHref(c.kind, c.value)}
                  data-channel={c.kind}
                  title={c.value}
                  className={`block truncate text-ink ${c.kind === 'phone' ? 'font-mono' : ''}`}
                >
                  {c.kind === 'phone' ? say(c.value) : channelLabel(c.kind, c.value)}
                </a>
              </Fact>
            ))}
            {person.city && <Fact name="Lives in">{cityAndCountry(person.city)}</Fact>}
            {person.hometown && <Fact name="Hometown">{cityAndCountry(person.hometown)}</Fact>}
            {before.map((r) => (
              <Fact key={`${r.organisationId}-${r.to}`} name="Before">
                <span>{r.title ? `${r.title}, ${r.organisationName}` : r.organisationName}</span>
                <span className="text-ui text-subtle">
                  {r.from ? `${monthYear(r.from)} to ` : 'To '}
                  {monthYear(r.to!)}
                </span>
              </Fact>
            ))}
            {person.note && (
              <Fact name="Notes">
                <NoteBody source={person.note} />
              </Fact>
            )}
          </dl>
        </section>
      )}

      {blocks.map((block, i) => (
        <div key={i} className="min-w-0">
          {block}
        </div>
      ))}
      {picker}

      {more && (
        <BottomSheet title={person.name} onClose={() => setMore(false)}>
          <div className="px-4 pb-4">
            <DeletePerson person={person} onDeleted={() => navigate('/people')} />
          </div>
        </BottomSheet>
      )}
    </div>
  )
}

/** Call, Message, Email: a big tap each; without that way to reach them, greyed (FR-087). */
function Reach({
  icon: Icon,
  label,
  href,
}: {
  icon: IconComponent
  label: string
  href: string | null
}) {
  const look =
    'flex h-16 flex-col items-center justify-center gap-1 rounded-phone-card border border-line bg-panel text-ui font-medium'
  return href ? (
    <a href={href} className={`${look} text-task-t`}>
      <Icon size={22} aria-hidden="true" />
      {label}
    </a>
  ) : (
    <span aria-disabled="true" className={`${look} text-subtle opacity-60`}>
      <Icon size={22} aria-hidden="true" />
      {label}
    </span>
  )
}

function Line({
  icon: Icon,
  tone = 'text-muted',
  trail,
  children,
}: {
  icon: IconComponent
  tone?: string
  trail?: ReactNode
  children: ReactNode
}) {
  return (
    <li className="flex min-h-14 items-center gap-3 px-3.5 py-2">
      <Icon size={18} aria-hidden="true" className={`shrink-0 ${tone}`} />
      <span className="flex min-w-0 flex-1 flex-col">{children}</span>
      {trail}
    </li>
  )
}

function Fact({ name, children }: { name: string; children: ReactNode }) {
  return (
    <div className="contents">
      <dt className="text-ui text-muted">{name}</dt>
      <dd className="flex min-w-0 flex-col text-ink">{children}</dd>
    </div>
  )
}
