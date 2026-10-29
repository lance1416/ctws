import type { PersonResponse } from '@ctws/contracts'
import { avatarInitials } from '@ctws/core'
import { useQuery } from '@tanstack/react-query'
import { useContext, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { EditCircles } from '../components/EditCircles'
import { nearDay, shortDay, weekdayDay, ymd } from '../../../platform/time/dates'
import { useNow } from '../../../platform/time/useNow'
import { Avatar } from '../../../platform/ui/Avatar'
import { BUTTON } from '../../../platform/ui/buttonStyles'
import {
  CakeIcon,
  CirclesIcon,
  InTouchIcon,
  KIND_ICON,
  NewIcon,
  OutOfTouchIcon,
  ReceivedIcon,
  SentIcon,
  type IconComponent,
} from '../../../platform/ui/icons'
import { PageHead } from '../../../platform/ui/PageHead'
import { useTimeZone } from '../../../shell/auth'
import { NewContext } from '../../../shell/creates'
import { ModuleEmpty } from '../../../shell/layout'
import { useRegistry } from '../../../shell/registry'
import { birthdaysQuery, circlesQuery, peopleQuery, touchQuery } from '../api'
import { sinceWords } from '../logic/since'

/** The birthday block's window (FR-060). */
const SOON_DAYS = 30

/**
 * THE PEOPLE OVERVIEW (FR-060, artboard 18): whose birthday is coming, who you were in touch with
 * lately and with whom it has been a while, and the circles, each a way into the sidebar's list.
 */
export function PeopleOverview() {
  const people = useQuery(peopleQuery())
  const openNew = useContext(NewContext)
  const creator = useRegistry().creates.find((c) => c.kind === 'person')
  // Nobody yet: the badge, a line and New person, nothing else (FR-030, artboard 23).
  if (people.isSuccess && people.data.length === 0) return <ModuleEmpty kind="person" />
  const byId = new Map((people.data ?? []).map((p) => [p.id as string, p]))
  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex items-center gap-3">
        <div className="flex-1">
          <PageHead>People</PageHead>
        </div>
        {creator && (
          <button
            type="button"
            onClick={() => openNew(creator, { opens: true })}
            className={BUTTON.secondary}
          >
            <NewIcon size={16} aria-hidden="true" />
            New person
          </button>
        )}
      </div>
      <div className="grid items-start gap-3 lg:grid-cols-2">
        <Birthdays />
        <InTouch byId={byId} />
        <OutOfTouch byId={byId} />
        <Circles />
      </div>
    </div>
  )
}

function Block({
  title,
  icon: Icon,
  tint,
  count,
  action,
  empty = null,
  children,
}: {
  title: string
  icon: IconComponent
  tint: string
  count?: number
  action?: ReactNode
  /** Nothing to list: the block is its head, saying this after its title (DES-001 v1.24). */
  empty?: string | null
  children: ReactNode
}) {
  return (
    <section
      aria-label={title}
      className="flex min-w-0 flex-col overflow-hidden rounded-block border border-line bg-panel"
    >
      <div
        className={`flex h-10 shrink-0 items-center gap-2 pr-2 pl-3 ${empty ? '' : 'border-b border-line'}`}
      >
        <span
          aria-hidden="true"
          className={`grid size-6 place-items-center rounded-control ${tint}`}
        >
          <Icon size={14} />
        </span>
        <h2 className="text-ui font-medium text-ink">{title}</h2>
        {empty ? (
          <span className="text-meta text-subtle">{empty}</span>
        ) : (
          count !== undefined && <span className="text-meta text-subtle tabular-nums">{count}</span>
        )}
        <span className="flex-1" />
        {action}
      </div>
      {!empty && <div className="p-1.5">{children}</div>}
    </section>
  )
}

/** One person on a row of a block: avatar, name, then what the block says of them. */
function PersonRow({
  id,
  name,
  initials,
  strong = false,
  children,
}: {
  id: string
  name: string
  initials: string
  strong?: boolean
  children: ReactNode
}) {
  return (
    <li>
      <Link
        to={`/people/${id}`}
        className="grid min-h-10 grid-cols-[24px_minmax(0,1fr)_auto] items-center gap-3 rounded-control px-3 hover:bg-hover"
      >
        <Avatar initials={initials} />
        <span className={`truncate text-ui text-ink ${strong ? 'font-medium' : ''}`}>{name}</span>
        <span className="flex items-center gap-3">{children}</span>
      </Link>
    </li>
  )
}

function Birthdays() {
  const birthdays = useQuery(birthdaysQuery())
  const today = ymd(useNow(), useTimeZone())
  const all = [...(birthdays.data?.coming ?? []), ...(birthdays.data?.later ?? [])]
  const soon = all.filter((r) => r.inDays <= SOON_DAYS)
  return (
    <Block
      empty={soon.length === 0 ? 'None' : null}
      title={`Birthdays in the next ${SOON_DAYS} days`}
      icon={CakeIcon}
      tint="bg-person-bg text-person"
      count={soon.length}
      action={
        all.length > 0 && (
          <Link to="/people?list=birthdays" className={BUTTON.inline}>
            All {all.length}
          </Link>
        )
      }
    >
      <ul>
        {soon.map((r) => (
          <PersonRow
            key={r.personId}
            id={r.personId}
            name={r.name}
            initials={r.initials}
            strong={r.inDays <= 7}
          >
            <span className="w-24 text-meta text-subtle">{weekdayDay(r.day, today)}</span>
            <span
              className={`w-10 text-right text-ui tabular-nums ${
                r.inDays <= 7 ? 'font-medium text-person-t' : 'text-muted'
              }`}
            >
              {r.inDays} d
            </span>
          </PersonRow>
        ))}
      </ul>
    </Block>
  )
}

const HOW: Record<
  'sent' | 'received' | 'meeting',
  { icon: IconComponent; tint: string; word: string }
> = {
  sent: { icon: SentIcon, tint: 'bg-communication-bg text-communication', word: 'Message sent' },
  received: {
    icon: ReceivedIcon,
    tint: 'bg-communication-bg text-communication',
    word: 'Message received',
  },
  meeting: { icon: KIND_ICON.meeting, tint: 'bg-meeting-bg text-meeting', word: 'Met' },
}

type People = Map<string, PersonResponse>

function InTouch({ byId }: { byId: People }) {
  const touch = useQuery(touchQuery())
  const timeZone = useTimeZone()
  const today = ymd(useNow(), timeZone)
  const rows = (touch.data?.recent ?? []).flatMap((t) => {
    const p = byId.get(t.personId)
    return p ? [{ ...t, person: p }] : []
  })
  return (
    <Block
      empty={rows.length === 0 ? 'None' : null}
      title="Recently in touch"
      icon={InTouchIcon}
      tint="bg-hover text-muted"
    >
      <ul>
        {rows.map((t) => {
          const how = HOW[t.kind]
          const day = ymd(new Date(t.at), timeZone)
          return (
            <PersonRow
              key={t.personId}
              id={t.personId}
              name={t.person.name}
              initials={avatarInitials(t.person)}
              strong
            >
              <Mark icon={how.icon} tint={how.tint} word={how.word} />
              <span className="w-16 text-right font-mono text-meta text-muted">
                {nearDay(day, today) ?? shortDay(day, today)}
              </span>
            </PersonRow>
          )
        })}
      </ul>
    </Block>
  )
}

function Mark({ icon: Icon, tint, word }: { icon: IconComponent; tint: string; word: string }) {
  return (
    <span title={word} className={`grid size-6 place-items-center rounded-control ${tint}`}>
      <Icon size={14} />
      <span className="sr-only">{word}</span>
    </span>
  )
}

function OutOfTouch({ byId }: { byId: People }) {
  const touch = useQuery(touchQuery())
  const timeZone = useTimeZone()
  const today = ymd(useNow(), timeZone)
  const rows = (touch.data?.quiet ?? []).flatMap((t) => {
    const p = byId.get(t.personId)
    return p ? [{ ...t, person: p }] : []
  })
  return (
    <Block
      empty={rows.length === 0 ? 'None' : null}
      title="Not in touch for a while"
      icon={OutOfTouchIcon}
      tint="bg-hover text-muted"
    >
      <ul>
        {rows.map((t) => (
          <PersonRow
            key={t.personId}
            id={t.personId}
            name={t.person.name}
            initials={avatarInitials(t.person)}
          >
            <span className="text-meta text-subtle">
              {sinceWords(ymd(new Date(t.at), timeZone), today)}
            </span>
          </PersonRow>
        ))}
      </ul>
    </Block>
  )
}

function Circles() {
  const circles = useQuery(circlesQuery())
  // Edit opens the list beside the page, to reorder, rename, add and delete (artboard 29).
  const [editing, setEditing] = useState(false)
  return (
    <>
      <Block
        empty={(circles.data ?? []).length === 0 ? 'None yet' : null}
        title="Circles"
        icon={CirclesIcon}
        tint="bg-hover text-muted"
        action={
          <button
            type="button"
            onClick={() => setEditing(true)}
            className={`${BUTTON.quiet} h-7 px-2.5 text-meta`}
          >
            Edit
          </button>
        }
      >
        <div className="flex flex-wrap gap-2 p-2">
          {(circles.data ?? []).map((c) => (
            <Link
              key={c.id}
              to={`/people?circle=${c.id}`}
              className="inline-flex h-6.5 items-center gap-1.5 rounded-control bg-hover px-2.5 text-ui text-ink hover:bg-select"
            >
              {c.name}
              <span className="text-meta text-muted tabular-nums">{c.count}</span>
            </Link>
          ))}
        </div>
      </Block>
      {editing && circles.data && (
        <EditCircles circles={circles.data} onClose={() => setEditing(false)} />
      )}
    </>
  )
}
