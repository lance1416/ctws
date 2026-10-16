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
      /** Query keys this write waits for; everything else refetches without being waited on. */
      awaits?: readonly QueryKey[]
      /** False for a write after which nothing should refetch (signing out). */
      refresh?: false
      /** True for a write that says its own failure where it happened; else the frame says it. */
      ownsError?: true
    }
  }
}

/**
 * After a write every query is stale: the watched ones refetch now, the rest on their next mount.
 * Resolves once the `awaits` ones are back. In-flight reads are cancelled first, because
 * invalidating a query that has no data yet reuses its in-flight fetch, whose answer predates
 * the write.
 */
export async function refreshQueries(
  qc: QueryClient,
  awaits: readonly QueryKey[] = [],
): Promise<void> {
  await qc.cancelQueries()
  const isAwaited = (query: Query) => awaits.some((queryKey) => matchQuery({ queryKey }, query))
  void qc.invalidateQueries({ predicate: (q) => !isAwaited(q) })
  if (awaits.length > 0) await qc.invalidateQueries({ predicate: isAwaited })
}

/**
 * Runs `refreshQueries` after every mutation. A success refreshes before the write's own
 * onSuccess, so that sees fresh data; a failure refreshes after the write's onError has rolled
 * back, since a write of two requests can fail after the first landed. While another write is
 * still pending, only the last to finish refreshes: an answer read in between would put back
 * what that write already shows. A failure no write claims (`ownsError`) is reported for the
 * frame to say; the next write clears it.
 */
export function refreshAfterWrites(client: () => QueryClient): MutationCache {
  const refresh = async (meta: Mutation['meta']) => {
    if (meta?.refresh === false) return
    const qc = client()
    // The write being settled is still counted; one that refreshes nothing (a capture wrapping
    // the write that does) is not waited for.
    if (qc.isMutating({ predicate: (m) => m.meta?.refresh !== false }) > 1) return
    await refreshQueries(qc, meta?.awaits)
  }
  return new MutationCache({
    onMutate: () => clearWriteFailure(),
    onError: (error, _variables, _context, mutation) => {
      if (!mutation.meta?.ownsError) reportWriteFailure(error)
    },
    onSuccess: (_data, _variables, _context, mutation) => refresh(mutation.meta),
    onSettled: (_data, error, _variables, _context, mutation) =>
      error ? refresh(mutation.meta) : undefined,
  })
}
