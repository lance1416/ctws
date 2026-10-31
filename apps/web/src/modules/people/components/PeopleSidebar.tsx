import type { PersonResponse } from '@ctws/contracts'
import { avatarInitials } from '@ctws/core'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, NavLink, useSearchParams } from 'react-router-dom'
import { Avatar } from '../../../platform/ui/Avatar'
import { CloseIcon } from '../../../platform/ui/icons'
import { ICON_BUTTON } from '../../../platform/ui/buttonStyles'
import { FILTER_FROM, FilteredEmpty, matches, SidebarFilter } from '../../../shell/layout'
import { birthdaysQuery, circlesQuery, peopleQuery } from '../api'
import { useNewPersonDraft } from '../logic/newPersonDraft'
import { sortByFiled } from '../logic/peopleOrder'

const ROW = ({ isActive }: { isActive: boolean }) =>
  `mx-1.5 flex h-7.5 items-center gap-2 rounded-control px-2 text-ui hover:bg-hover ${
    isActive ? 'bg-select font-medium text-ink' : 'text-ink'
  }`

/**
 * The People sidebar's list (FR-020, D2-04): everyone, grouped A to Z by the letter they are filed
 * under. The overview narrows it: a circle (`?circle=`) to its people, and "All N" of the
 * birthdays (`?list=birthdays`) to everyone with one, the nearest first (FR-060).
 */
export function PeopleSidebar() {
  const [params] = useSearchParams()
  const circle = params.get('circle')
  if (params.get('list') === 'birthdays') return <BirthdayList />
  return <Everyone circle={circle} />
}

/** Past this many, A to Z down the sidebar's edge (FR-015). */
const RAIL_FROM = 40

/** Keeps the narrowing when a person is opened from the list. */
const toPerson = (id: string, search: string) => `/people/${id}${search ? `?${search}` : ''}`

function Everyone({ circle }: { circle: string | null }) {
  const people = useQuery(peopleQuery())
  const circles = useQuery(circlesQuery())
  const [params] = useSearchParams()
  const picked = circle ? circles.data?.find((c) => c.id === circle) : undefined
  // Past a dozen, a box at the top narrows them by name or another name (U-16).
  const [typed, setTyped] = useState('')
  const inCircle = (people.data ?? []).filter(
    (p) => !circle || p.circleIds.some((c) => c === circle),
  )
  const shown = inCircle.filter(
    (p) => matches(p.name, typed) || p.aliases.some((a) => matches(a.name, typed)),
  )
  const groups = new Map<string, PersonResponse[]>()
  for (const p of shown) {
    const letter = /^[A-Z]$/.test(p.sortKey) ? p.sortKey : '#'
    groups.set(letter, [...(groups.get(letter) ?? []), p])
  }
  // Someone being written down on New person has their place already, marked New (FR-062).
  const draft = useNewPersonDraft()
  const draftLetter = draft ? (/^[A-Z]$/.test(draft.sortKey) ? draft.sortKey : '#') : null
  if (draftLetter && !groups.has(draftLetter)) groups.set(draftLetter, [])
  const letters = [...groups.keys()].sort((a, b) =>
    a === '#' ? 1 : b === '#' ? -1 : a.localeCompare(b),
  )
  // Hundreds of them: A to Z down the right edge, a press to each letter (FR-015, U-16).
  const rail = shown.length > RAIL_FROM && letters.length > 1
  return (
    <>
      {(inCircle.length > FILTER_FROM || typed) && (
        <SidebarFilter what="people" value={typed} onChange={setTyped} />
      )}
      <div className="relative flex min-h-0 flex-1">
        <nav
          aria-label="People"
          className={`flex min-h-0 flex-1 flex-col overflow-y-auto pb-2 *:shrink-0 ${rail ? 'pr-4' : ''}`}
        >
          {typed.trim() !== '' && shown.length === 0 && (
            <FilteredEmpty typed={typed} onClear={() => setTyped('')} />
          )}
          {circle && (
            <Narrowed label={picked ? `In ${picked.name}` : 'In a circle'} count={shown.length} />
          )}
          {letters.map((letter) => (
            <section key={letter} aria-label={letter} id={`people-${letter}`}>
              <h3 className="px-3.5 pt-2.5 pb-1 text-meta text-subtle">{letter}</h3>
              <ul className="flex flex-col gap-px">
                {sortByFiled(groups.get(letter)!).map((p) => (
                  <li key={p.id} data-person-row={p.id}>
                    <NavLink to={toPerson(p.id, params.toString())} className={ROW}>
                      <Avatar initials={avatarInitials(p)} />
                      <span className="flex-1 truncate">{p.name}</span>
                    </NavLink>
                  </li>
                ))}
                {draft && draftLetter === letter && (
                  <li data-person-row="new" className="mx-1.5">
                    <span className="flex h-7.5 items-center gap-2 rounded-control bg-select px-2 text-ui font-medium text-ink">
                      <Avatar initials={draft.initials} />
                      <span className="flex-1 truncate">{draft.name}</span>
                      <span className="text-meta font-normal text-subtle">New</span>
                    </span>
                  </li>
                )}
              </ul>
            </section>
          ))}
        </nav>
        {rail && (
          <ol
            aria-label="Jump to a letter"
            className="absolute inset-y-1 right-0.5 flex flex-col justify-center"
          >
            {letters.map((letter) => (
              <li key={letter}>
                <button
                  type="button"
                  onClick={() => document.getElementById(`people-${letter}`)?.scrollIntoView()}
                  aria-label={`Jump to ${letter}`}
                  // Letters, not figures: the text face, at the smallest step there is.
                  className="block w-4 rounded-control text-center text-meta font-medium text-muted hover:bg-hover hover:text-ink"
                >
                  {letter}
                </button>
              </li>
            ))}
          </ol>
        )}
      </div>
    </>
  )
}

/** Everyone with a birthday, the nearest first, each with the day and how far off. */
function BirthdayList() {
  const birthdays = useQuery(birthdaysQuery())
  const [params] = useSearchParams()
  const rows = [...(birthdays.data?.coming ?? []), ...(birthdays.data?.later ?? [])]
  return (
    <nav
      aria-label="Birthdays"
      className="flex min-h-0 flex-1 flex-col overflow-y-auto pb-2 *:shrink-0"
    >
      <Narrowed label="Birthdays" count={rows.length} />
      <ul className="flex flex-col gap-px">
        {rows.map((r) => (
          <li key={r.personId} data-birthday-row={r.personId}>
            <NavLink to={toPerson(r.personId, params.toString())} className={ROW}>
              <Avatar initials={r.initials} />
              <span className="flex-1 truncate">{r.name}</span>
              <span className="shrink-0 text-meta text-subtle tabular-nums">{r.inDays} d</span>
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  )
}

/** What the list is narrowed to, and the way back to everyone. */
function Narrowed({ label, count }: { label: string; count: number }) {
  return (
    <div className="mx-1.5 mb-1 flex h-7.5 items-center gap-2 rounded-control bg-hover pr-0.5 pl-2 text-ui">
      <span className="flex-1 truncate font-medium text-ink">{label}</span>
      <span className="text-meta text-subtle tabular-nums">{count}</span>
      <Link to="/people" aria-label="Show everyone" className={ICON_BUTTON}>
        <CloseIcon size={14} aria-hidden="true" />
      </Link>
    </div>
  )
}
