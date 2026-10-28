import {
  api,
  type CreateOrganisationBody,
  type OrganisationId,
  type OrganisationResponse,
  type UpdateOrganisationBody,
} from '@ctws/contracts'
import { queryOptions } from '@tanstack/react-query'
import { call, everyPage } from '../../platform/http/api'

/** This module's query keys. Every one starts with `'organisations'`, so `all` reaches each. */
export const organisationKeys = {
  all: ['organisations'] as const,
  list: ['organisations', 'list'] as const,
  overview: ['organisations', 'overview'] as const,
  inTouch: ['organisations', 'in-touch'] as const,
}

async function listOrganisations(signal: AbortSignal): Promise<OrganisationResponse[]> {
  const pages = await everyPage(
    (cursor) => call(api.organisations.list, { query: { cursor } }, { signal }),
    signal,
  )
  return pages.flatMap((p) => p.organisations)
}

/** Every organisation, by name; the sidebar and the page read them from here. */
export const organisationsQuery = () =>
  queryOptions({
    queryKey: organisationKeys.list,
    queryFn: ({ signal }) => listOrganisations(signal),
  })

/** Each type with its count, and how many in all (FR-064). */
export const overviewQuery = () =>
  queryOptions({
    queryKey: organisationKeys.overview,
    queryFn: ({ signal }) =>
      call(api.organisations.overview, { query: { view: 'overview' } }, { signal }),
  })

/** The organisations in touch in the last 30 days, as the communication overview counts them. */
export const inTouchQuery = () =>
  queryOptions({
    queryKey: organisationKeys.inTouch,
    queryFn: async ({ signal }) => {
      const overview = await call(
        api.communication.overview,
        { query: { view: 'overview' } },
        { signal },
      )
      return { rows: overview.inTouch, total: overview.inTouchTotal }
    },
  })

export function createOrganisation(body: CreateOrganisationBody): Promise<OrganisationResponse> {
  return call(api.organisations.create, { body })
}

export function patchOrganisation(
  id: OrganisationId,
  body: UpdateOrganisationBody,
): Promise<OrganisationResponse> {
  return call(api.organisations.update, { params: { id }, body })
}

export function deleteOrganisation(id: OrganisationId): Promise<void> {
  return call(api.organisations.remove, { params: { id } })
}
