import { api, type CreateLinkBody, type LinkKind, type ObjectType } from '@ctws/contracts'
import { queryOptions } from '@tanstack/react-query'
import { call } from '../../platform/http/api'

export type Endpoint = { type: ObjectType; id: string }

export const linksQuery = (of: Endpoint) =>
  queryOptions({
    queryKey: ['links', of.type, of.id],
    queryFn: async () => (await call(api.links.of, { params: of })).groups,
  })

export function createLink(body: CreateLinkBody) {
  return call(api.links.create, { body })
}

export function deleteLink(from: Endpoint, to: Endpoint, kind: LinkKind): Promise<void> {
  return call(api.links.remove, {
    query: { fromType: from.type, fromId: from.id, toType: to.type, toId: to.id, kind },
  })
}

/** Things this one could be joined to, for the picker. An empty `q` means the likely few. */
export const candidatesQuery = (of: Endpoint, q: string) =>
  queryOptions({
    queryKey: ['links', 'candidates', of.type, of.id, q],
    queryFn: async () =>
      (await call(api.links.candidates, { query: { ...of, ...(q ? { q } : {}) } })).candidates,
  })
