import type { OrganisationResponse } from '@ctws/contracts'
import { useQuery } from '@tanstack/react-query'
import { Link, NavLink, useSearchParams } from 'react-router-dom'
import { organisationsQuery, overviewQuery } from '../api'
import { fileLetter, OTHER, pluralType } from '../logic/types'
import { OrganisationMark } from './OrganisationMark'

const ROW = ({ isActive }: { isActive: boolean }) =>
  `mx-1.5 flex h-7.5 items-center gap-2 rounded-control px-2 text-ui hover:bg-hover ${
    isActive ? 'bg-select font-medium text-ink' : 'text-ink'
  }`

/**
 * The Organisations sidebar's list (FR-020, artboard 14): every organisation, grouped A to Z, and
 * above it All and every type used, as the overview has them (G-03). A type (`?type=`) narrows
 * the list, and the overview's table with it.
 */
export function OrganisationsSidebar() {
  const organisations = useQuery(organisationsQuery())
  const overview = useQuery(overviewQuery())
  const [params] = useSearchParams()
  const type = params.get('type')
  const shown = (organisations.data ?? []).filter((o) => ofType(o, type))
  const groups = new Map<string, OrganisationResponse[]>()
  for (const o of shown) {
    const letter = fileLetter(o.name)
    groups.set(letter, [...(groups.get(letter) ?? []), o])
  }
  const letters = [...groups.keys()].sort((a, b) =>
    a === '#' ? 1 : b === '#' ? -1 : a.localeCompare(b),
  )
  const offered = [
    ...(overview.data?.types ?? []).map((t) => t.type),
    ...(overview.data?.untyped ? [OTHER] : []),
  ]
  return (
    <nav
      aria-label="Organisations"
      className="flex min-h-0 flex-1 flex-col overflow-y-auto pb-2 *:shrink-0"
    >
      <div role="group" aria-label="Type" className="flex flex-wrap gap-0.5 px-2.5 pb-1.5">
        <TypeTab to="/organisations" on={type === null}>
          All
        </TypeTab>
        {offered.map((t) => (
          <TypeTab key={t} to={`/organisations?type=${encodeURIComponent(t)}`} on={type === t}>
            {t === OTHER ? OTHER : pluralType(t)}
          </TypeTab>
        ))}
      </div>
      {letters.map((letter) => (
        <section key={letter} aria-label={letter}>
          <h3 className="px-3.5 pt-2.5 pb-1 text-meta text-subtle">{letter}</h3>
          <ul className="flex flex-col gap-px">
            {groups
              .get(letter)!
              .sort((a, b) => a.name.localeCompare(b.name, 'en'))
              .map((o) => (
                <li key={o.id} data-organisation-row={o.id}>
                  <NavLink
                    to={`/organisations/${o.id}${type ? `?type=${encodeURIComponent(type)}` : ''}`}
                    className={ROW}
                  >
                    <OrganisationMark name={o.name} />
                    <span className="flex-1 truncate">{o.name}</span>
                  </NavLink>
                </li>
              ))}
          </ul>
        </section>
      ))}
    </nav>
  )
}

/** Whether an organisation is of the type picked; `Other` is those with none. */
export const ofType = (o: OrganisationResponse, type: string | null) =>
  type === null || (type === OTHER ? o.type === null : o.type === type)

function TypeTab({ to, on, children }: { to: string; on: boolean; children: string }) {
  return (
    <Link
      to={to}
      aria-current={on ? 'true' : undefined}
      className={`inline-flex h-7 items-center rounded-control px-2.5 text-meta font-medium ${
        on ? 'bg-select text-ink' : 'text-muted hover:bg-hover hover:text-ink'
      }`}
    >
      {children}
    </Link>
  )
}
