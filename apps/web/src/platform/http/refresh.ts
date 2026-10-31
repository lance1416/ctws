import type { ObjectType } from '@ctws/contracts'
import {
  matchQuery,
  MutationCache,
  type Mutation,
  type Query,
  type QueryClient,
  type QueryKey,
} from '@tanstack/react-query'
import { clearWriteFailure, reportWriteFailure } from './writeFailure'

declare module '@tanstack/react-query' {
  interface Register {
    mutationMeta: {
      /**
       * The kinds of thing the write changed; the queries that read them are refreshed. A write
       * that does not say refreshes every query.
       */
      changes?: readonly ObjectType[]
      /** Query keys this write waits for; the rest refetch without being waited on. */
      awaits?: readonly QueryKey[]
      /**
       * Queries of what the write removed (a deleted task's own reads): once it has landed they are
       * not asked again, even while still on screen, since what they read answers 404.
       */
      gone?: readonly QueryKey[]
      /** False for a write after which nothing should refetch (signing out). */
      refresh?: false
      /** True for a write that says its own failure where it happened; else the frame says it. */
      ownsError?: true
    }
  }
}

/** The queries a write leaves stale, as key prefixes; `all` for a write that cannot say. */
type Stale = readonly QueryKey[] | 'all'

/** Which query keys read which kinds of thing: what a write's `changes` make stale. */
export type StaleFor = (changes: readonly ObjectType[]) => readonly QueryKey[]

const matches = (keys: readonly QueryKey[]) => (query: Query) =>
  keys.some((queryKey) => matchQuery({ queryKey }, query))

/**
 * After a write the `stale` queries are stale: the watched ones refetch now, the rest on their
 * next mount. Resolves once the `awaits` ones are back. Their in-flight reads are cancelled first,
 * because invalidating a query that has no data yet reuses its in-flight fetch, whose answer
 * predates the write. The `gone` ones are cancelled and left: what they read is no more.
 */
export async function refreshQueries(
  qc: QueryClient,
  stale: Stale,
  awaits: readonly QueryKey[] = [],
  gone: readonly QueryKey[] = [],
): Promise<void> {
  const isGone = matches(gone)
  const isStale = (q: Query) => !isGone(q) && (stale === 'all' || matches(stale)(q))
  const isAwaited = (q: Query) => !isGone(q) && matches(awaits)(q)
  await qc.cancelQueries({ predicate: (q) => isStale(q) || isAwaited(q) || isGone(q) })
  void qc.invalidateQueries({ predicate: (q) => isStale(q) && !isAwaited(q) })
  if (awaits.length > 0) await qc.invalidateQueries({ predicate: isAwaited })
}

/** Both writes' stale queries. */
const union = (a: Stale, b: Stale): Stale => (a === 'all' || b === 'all' ? 'all' : [...a, ...b])

/**
 * Runs `refreshQueries` after every mutation, on the queries that read what it `changes`. A success
 * refreshes before the write's own onSuccess, so that sees fresh data; a failure refreshes after
 * the write's onError has rolled back, since a write of two requests can fail after the first
 * landed. While another write is still pending, only the last to finish refreshes, and it
 * refreshes what every one of them left stale: an answer read in between would put back what that
 * write already shows. A failure no write claims (`ownsError`) is reported for the frame to say;
 * the next write clears it.
 */
export function refreshAfterWrites(client: () => QueryClient, staleFor: StaleFor): MutationCache {
  let owed: Stale = []
  let removed: QueryKey[] = []
  const refresh = async (meta: Mutation['meta'], landed: boolean) => {
    if (meta?.refresh === false) return
    owed = union(owed, meta?.changes ? staleFor(meta.changes) : 'all')
    // Only a write that landed removed anything; a failed one left it all in place.
    if (landed) removed = [...removed, ...(meta?.gone ?? [])]
    const qc = client()
    // The write being settled is still counted; one that refreshes nothing (a capture wrapping
    // the write that does) is not waited for.
    if (qc.isMutating({ predicate: (m) => m.meta?.refresh !== false }) > 1) return
    const stale = owed
    const gone = removed
    owed = []
    removed = []
    await refreshQueries(qc, stale, meta?.awaits, gone)
  }
  return new MutationCache({
    onMutate: () => clearWriteFailure(),
    onError: (error, _variables, _context, mutation) => {
      if (!mutation.meta?.ownsError) reportWriteFailure(error)
    },
    onSuccess: (_data, _variables, _context, mutation) => refresh(mutation.meta, true),
    onSettled: (_data, error, _variables, _context, mutation) =>
      error ? refresh(mutation.meta, false) : undefined,
  })
}
