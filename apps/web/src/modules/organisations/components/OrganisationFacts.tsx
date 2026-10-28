import type { LinkCandidate } from '@ctws/contracts'
import { useQuery } from '@tanstack/react-query'
import { organisationsQuery } from '../api'
import { OrganisationMark } from './OrganisationMark'

/** An organisation listed among things of every kind: its type ("Law firm"), or nothing. */
export function OrganisationFact({ thing }: { thing: LinkCandidate }) {
  return thing.type === 'organisation' && thing.organisationType ? (
    <span className="truncate">{thing.organisationType}</span>
  ) : null
}

/** Its letter on the kind's tint, where things of every kind are listed. */
export function OrganisationListMark({ thing }: { thing: LinkCandidate }) {
  return <OrganisationMark name={thing.title} />
}

/** Things' count for organisations: every one, zero included. */
export function OrganisationsCount() {
  const organisations = useQuery(organisationsQuery())
  if (!organisations.data) return null
  return <span data-count>{organisations.data.length}</span>
}
