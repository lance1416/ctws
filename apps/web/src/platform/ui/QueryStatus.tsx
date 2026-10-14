import { HANG } from './hang'
/** "Loading…" while a page's main list comes, and its error if it does not. */
export function QueryStatus({
  query,
}: {
  query: { isPending: boolean; isError: boolean; error: unknown }
}) {
  if (query.isPending) return <p className={`mt-6 ${HANG} text-ink-muted`}>Loading…</p>
  if (!query.isError) return null
  return (
    <p role="alert" className={`mt-6 ${HANG} text-danger`}>
      {query.error instanceof Error
        ? query.error.message
        : "Couldn't load. Check that the server is running."}
    </p>
  )
}
