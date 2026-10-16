import { api, type CreateLinkBody, type LinkId, type ObjectType } from '@ctws/contracts'
import { queryOptions } from '@tanstack/react-query'
import { call } from '../../platform/http/api'

export type Endpoint = { type: ObjectType; id: string }

export const linksQuery = (of: Endpoint) =>
  queryOptions({
    queryKey: ['links', of.type, of.id],
    queryFn: async ({ signal }) => (await call(api.links.of, { query: of }, { signal })).groups,
  })

export function createLink(body: CreateLinkBody) {
  return call(api.links.create, { body })
}

export function deleteLink(id: LinkId): Promise<void> {
  return call(api.links.remove, { params: { id } })
}

/** Things this one could be joined to, for the picker. An empty `q` means the likely few. */
export const candidatesQuery = (of: Endpoint, q: string) =>
  queryOptions({
    queryKey: ['links', 'candidates', of.type, of.id, q],
    queryFn: async ({ signal }) =>
      (
        await call(
          api.links.candidates,
          { query: { view: 'candidates', ...of, ...(q ? { q } : {}) } },
          { signal },
        )
      ).candidates,
  })
