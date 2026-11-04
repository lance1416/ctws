import { type Allow, fetchOutside } from '../../../platform/outbound/fetch'
import { PAGE, readPage } from '../../../platform/outbound/page'

/**
 * A link's title and summary as its own page states them, fetched with every guard an outbound
 * request has (`platform/outbound`). Failing is not an error: many sites give crawlers nothing,
 * so failure is null and the caller shows the host and path.
 */

type Unfurled = { title: string | null; summary: string | null }

/**
 * What routes take instead of the function itself: tests pass a version that may reach
 * 127.0.0.1, which production must refuse.
 */
export type Unfurl = (url: string) => Promise<Unfurled | null>

/** The total budget; capture waits for it, so it is the slowest a pasted link comes back. */
const BUDGET_MS = 2000

type Options = { timeoutMs?: number; allow?: Allow }

export async function unfurl(raw: string, opts: Options = {}): Promise<Unfurled | null> {
  const got = await fetchOutside(raw, PAGE, {
    timeoutMs: opts.timeoutMs ?? BUDGET_MS,
    ...(opts.allow ? { allow: opts.allow } : {}),
  })
  if (!got) return null
  const { title, summary } = readPage(got.body, got.charset, got.url)
  if (!title && !summary) return null
  return { title, summary }
}
