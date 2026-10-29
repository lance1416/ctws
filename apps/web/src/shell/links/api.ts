import { api, type ObjectType, type RelationId } from '@ctws/contracts'
import { queryOptions, type QueryClient } from '@tanstack/react-query'
import { call } from '../../platform/http/api'

export type Endpoint = { type: ObjectType; id: string }

/** The shell's relation keys. Every one starts with `'links'`, so `all` reaches each of them. */
export const linkKeys = {
  all: ['links'] as const,
  of: (of: Endpoint, types: Kinds) => ['links', of.type, of.id, types?.join(',') ?? 'all'] as const,
  candidates: (of: Endpoint | null, q: string, kinds = '') =>
    ['links', 'candidates', of?.type ?? '', of?.id ?? '', q, kinds] as const,
}

/** The kinds of thing at the far end to list; every kind when undefined. */
type Kinds = readonly ObjectType[] | undefined

export const linksQuery = (of: Endpoint, types?: Kinds) =>
  queryOptions({
    queryKey: linkKeys.of(of, types),
    queryFn: async ({ signal }) =>
      (await call(api.relations.of, { query: { ...of, types: types?.join(',') } }, { signal }))
        .groups,
  })

export function createLink(body: { from: Endpoint; to: Endpoint; note?: string }) {
  return call(api.relations.create, { body })
}

export function deleteLink(id: RelationId): Promise<void> {
  return call(api.relations.remove, { params: { id } })
}

/** Things this one could be joined to, for the picker. An empty `q` means the likely few. */
/**
 * Things by name: what `of` could be related to, or, with no `of`, search's answer for `kinds`
 * (the kinds no module searches more closely).
 */
export const candidatesQuery = (of: Endpoint | null, q: string, kinds?: readonly ObjectType[]) =>
  queryOptions({
    queryKey: linkKeys.candidates(of, q, kinds?.join(',')),
    queryFn: async ({ signal }) =>
      (
        await call(
          api.links.candidates,
          {
            query: {
              view: 'candidates',
              ...(of ?? {}),
              ...(q ? { q } : {}),
              ...(kinds ? { kinds: kinds.join(',') } : {}),
            },
          },
          { signal },
        )
      ).candidates,
  })

/** Starts what `useLinked` will read for `of`, before its page is drawn (baseline.md §8). */
export function prefetchLinks(qc: QueryClient, of: Endpoint, types?: Kinds): void {
  void qc.prefetchQuery(linksQuery(of, types))
}
