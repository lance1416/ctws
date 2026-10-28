import type { MeetingOccurrence, PersonResponse } from '@ctws/contracts'
import { avatarInitials } from '@ctws/core'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Avatar } from '../../../platform/ui/Avatar'
import { DetailPane } from '../../../platform/ui/DetailPane'
import { boxed } from '../../../platform/ui/formStyles'
import { CloseIcon, ForwardIcon, KIND_ICON, PLACE_ICON } from '../../../platform/ui/icons'
import { ICON_BUTTON } from '../../../platform/ui/buttonStyles'
import { useMe } from '../../../shell/auth'
import { usePeople } from '../../people'

/** Past this many, the list is a row of faces, counted by organisation (FR-069). */
const LISTED = 7

/** The full list shows this many of an organisation before "N more at …". */
const PER_GROUP = 5

type Attendee = { id: string; name: string; person: PersonResponse | undefined }

/** Where someone works now, the first current role; none is "Others". */
const workplace = (a: Attendee) => a.person?.roles.find((r) => r.to === null)

/** The attendees by where they work now, the largest first, "Others" last. */
function byWorkplace(people: readonly Attendee[]) {
  const groups = new Map<string, Attendee[]>()
  for (const a of people) {
    const at = workplace(a)?.organisationName ?? ''
    groups.set(at, [...(groups.get(at) ?? []), a])
  }
  return [...groups.entries()]
    .map(([name, members]) => ({ name, members }))
    .sort((a, b) => (a.name === '' ? 1 : b.name === '' ? -1 : b.members.length - a.members.length))
}

/**
 * WHO IS IN IT (FR-067, FR-069, artboards 16 and 17): you first, then each attendee. A big meeting
 * is a row of seven faces and "+N", counted by organisation, with All N opening the whole list
 * beside the page, searchable, grouped by organisation.
 */
export function Attending({ meeting: m }: { meeting: MeetingOccurrence }) {
  const people = usePeople()
  const me = useMe().data
  const [all, setAll] = useState(false)
  const attendees: Attendee[] = m.attendees.map((a) => ({
    ...a,
    person: people.data?.find((p) => p.id === a.id),
  }))
  const initials = (a: Attendee) => (a.person ? avatarInitials(a.person) : ([...a.name][0] ?? '?'))
  const count = attendees.length + 1
  return (
    <section aria-label="Attending" className="flex flex-col gap-2.5">
      <h2 className="flex items-center gap-2 text-ui font-medium text-ink">
        <KIND_ICON.person size={16} aria-hidden="true" className="text-muted" />
        Attending
        <span className="text-meta font-normal text-subtle tabular-nums">{count}</span>
      </h2>
      {attendees.length <= LISTED ? (
        <ul className="flex flex-col gap-2 pl-6">
          <li className="flex items-center gap-2.5 text-ui text-ink">
            <Avatar initials={(me?.email.slice(0, 1) ?? '').toLocaleUpperCase()} />
            You
          </li>
          {attendees.map((a) => (
            <li key={a.id}>
              <Link
                to={`/people/${a.id}`}
                className="flex min-w-0 items-center gap-2.5 text-ui text-ink hover:underline"
              >
                <Avatar initials={initials(a)} />
                <span className="truncate">{a.name}</span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <div className="flex flex-col gap-2 pl-6">
          <span className="flex items-center" aria-label={`${count} people`}>
            {attendees.slice(0, LISTED).map((a) => (
              <span key={a.id} className="-ml-1 first:ml-0 rounded-full ring-2 ring-panel">
                <Avatar initials={initials(a)} />
              </span>
            ))}
            <span className="ml-1.5 text-meta text-muted tabular-nums">
              +{attendees.length - LISTED}
            </span>
          </span>
          <ul className="flex flex-col gap-1">
            {byWorkplace(attendees).map((g) => (
              <li
                key={g.name || 'others'}
                className="flex items-center justify-between gap-2 text-ui text-ink"
              >
                <span className="truncate">{g.name || 'Others'}</span>
                <span className="text-meta text-muted tabular-nums">{g.members.length}</span>
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={() => setAll(true)}
            className="inline-flex h-7 items-center gap-1 self-start rounded-control bg-hover px-2.5 text-meta font-medium text-ink hover:bg-select"
          >
            All {count}
            <ForwardIcon size={12} aria-hidden="true" />
          </button>
        </div>
      )}
      {all && (
        <EveryAttendee attendees={attendees} initials={initials} onClose={() => setAll(false)} />
      )}
    </section>
  )
}

/** Everyone in it, beside the page: found by name, grouped by where they work (FR-069). */
function EveryAttendee({
  attendees,
  initials,
  onClose,
}: {
  attendees: Attendee[]
  initials: (a: Attendee) => string
  onClose: () => void
}) {
  const [asked, setAsked] = useState('')
  const [open, setOpen] = useState<Set<string>>(new Set())
  const words = asked.trim().toLocaleLowerCase()
  const shown = attendees.filter((a) => a.name.toLocaleLowerCase().includes(words))
  return (
    <DetailPane label="Attending" onClose={onClose}>
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <KIND_ICON.person size={16} aria-hidden="true" className="text-muted" />
          <h2 className="flex-1 text-ui font-medium text-ink">Attending</h2>
          <span className="text-meta text-subtle tabular-nums">{attendees.length + 1}</span>
          <button type="button" onClick={onClose} aria-label="Close" className={ICON_BUTTON}>
            <CloseIcon size={16} aria-hidden="true" />
          </button>
        </div>
        <label className={`${boxed} flex items-center gap-2`}>
          <PLACE_ICON.search size={14} aria-hidden="true" className="text-muted" />
          <input
            type="search"
            aria-label="Find a person"
            placeholder="Find a person"
            autoFocus
            value={asked}
            onChange={(e) => setAsked(e.target.value)}
            data-bare
            className="min-w-0 flex-1 bg-transparent"
          />
        </label>
        {byWorkplace(shown).map((g) => {
          const key = g.name || 'others'
          const listed = words || open.has(key) ? g.members : g.members.slice(0, PER_GROUP)
          const more = g.members.length - listed.length
          return (
            <section key={key} aria-label={g.name || 'Others'} className="flex flex-col gap-1.5">
              <h3 className="flex items-center justify-between text-ui font-medium text-ink">
                {g.name || 'Others'}
                <span className="text-meta font-normal text-muted tabular-nums">
                  {g.members.length}
                </span>
              </h3>
              <ul className="flex flex-col gap-1.5">
                {listed.map((a) => (
                  <li key={a.id}>
                    <Link
                      to={`/people/${a.id}`}
                      className="flex min-w-0 items-center gap-2.5 hover:underline"
                    >
                      <Avatar initials={initials(a)} />
                      <span className="flex min-w-0 flex-col">
                        <span className="truncate text-ui text-ink">{a.name}</span>
                        {workplace(a)?.title && (
                          <span className="truncate text-meta text-muted">
                            {workplace(a)!.title}
                          </span>
                        )}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
              {more > 0 && (
                <button
                  type="button"
                  onClick={() => setOpen(new Set([...open, key]))}
                  className="self-start pl-8 text-meta text-muted hover:text-ink"
                >
                  {more} more at {g.name || 'Others'}
                </button>
              )}
            </section>
          )
        })}
      </div>
    </DetailPane>
  )
}
