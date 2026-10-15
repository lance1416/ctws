import type {
  CandidatesResponse,
  CreateLinkBody,
  LinkCandidate,
  LinkKind,
  LinksResponse,
  ObjectType,
} from '@ctws/contracts'
import { queryOptions } from '@tanstack/react-query'
import { apiFetch } from '../../platform/http/api'

/** The edge table is the shell's, like projects: flat, not under a module's namespace. */
const BASE = '/links'

export type Endpoint = { type: ObjectType; id: string }

async function listLinks(of: Endpoint): Promise<LinksResponse['groups']> {
  return (await apiFetch<LinksResponse>(`${BASE}/${of.type}/${of.id}`)).groups
}

export const linksQuery = (of: Endpoint) =>
  queryOptions({ queryKey: ['links', of.type, of.id], queryFn: () => listLinks(of) })

export function createLink(body: CreateLinkBody): Promise<{ created: boolean }> {
  return apiFetch(BASE, { method: 'POST', body: JSON.stringify(body) })
}

export function deleteLink(from: Endpoint, to: Endpoint, kind: LinkKind): Promise<void> {
  const params = new URLSearchParams({
    fromType: from.type,
    fromId: from.id,
    toType: to.type,
    toId: to.id,
    kind,
  })
  return apiFetch(`${BASE}?${params}`, { method: 'DELETE' })
}

/** Things this one could be joined to, for the picker. An empty `q` means the likely few. */
async function linkCandidates(of: Endpoint, q: string): Promise<LinkCandidate[]> {
  const params = new URLSearchParams({ type: of.type, id: of.id })
  if (q) params.set('q', q)
  return (await apiFetch<CandidatesResponse>(`${BASE}/candidates?${params}`)).candidates
}

export const candidatesQuery = (of: Endpoint, q: string) =>
  queryOptions({
    queryKey: ['links', 'candidates', of.type, of.id, q],
    queryFn: () => linkCandidates(of, q),
  })
