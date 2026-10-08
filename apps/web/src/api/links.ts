import type { CreateLinkBody, LinkKind, LinksResponse, ObjectType } from '@ctws/contracts'
import { apiFetch } from '../api'

/** The edge table is the SHELL's, like projects: flat, not under a module's namespace. */
const BASE = '/links'

export type Endpoint = { type: ObjectType; id: string }

export const linksKey = (of: Endpoint) => ['links', of.type, of.id] as const

export async function listLinks(of: Endpoint): Promise<LinksResponse['groups']> {
  return (await apiFetch<LinksResponse>(`${BASE}/${of.type}/${of.id}`)).groups
}

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
