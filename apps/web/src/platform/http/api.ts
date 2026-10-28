import {
  API_BASE,
  type Endpoint,
  href,
  type PageInfo,
  type RequestOf,
  type ResponseOf,
} from '@ctws/contracts'
import { z } from 'zod'

/** A failed request. `status` says which refusal it was; `message` is the server's title. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    /** problem+json's `detail`: the sentence meant for the person. */
    readonly detail?: string,
    /** problem+json's `type`, for a refusal the server names: `urn:ctws:problem:…`. */
    readonly type?: string,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

/**
 * A success this page cannot read: the server has been updated since the page was loaded. For a
 * write, the change went through, so the person is told that rather than to try again.
 */
export class OutdatedPageError extends Error {
  constructor(wrote: boolean) {
    super(
      wrote
        ? 'Saved, but CTWS has been updated since this page was opened. Reload the page.'
        : 'CTWS has been updated since this page was opened. Reload the page.',
    )
    this.name = 'OutdatedPageError'
  }
}

/**
 * What to tell a person about a failure: the server's sentence for them, else its title, else the
 * error's own message. Null for no error, or for something thrown that is not an Error.
 */
export function problemText(error: unknown): string | null {
  if (!(error instanceof Error)) return null
  return error instanceof ApiError ? (error.detail ?? error.message) : error.message
}

/** How a call is made, apart from what it sends. */
type CallOptions = {
  /** Aborts the request: a query passes its own, so a cancelled read stops on the wire too. */
  signal?: AbortSignal | undefined
}

/**
 * Calls one endpoint of the table: the path is built from its params and query, the body is sent
 * as JSON, and the answer is parsed by the endpoint's own response schema, so what a caller gets
 * is what the contract says rather than what it is assumed to be.
 */
export async function call<E extends Endpoint>(
  endpoint: E,
  ...[input, options]: object extends RequestOf<E>
    ? [RequestOf<E>?, CallOptions?]
    : [RequestOf<E>, CallOptions?]
): Promise<ResponseOf<E>> {
  const { params, query, body } = (input ?? {}) as {
    params?: object
    query?: object
    body?: unknown
  }
  const headers = new Headers()
  // The client half of the CSRF check: the API refuses unsafe methods without it.
  headers.set('x-ctws-client', 'web')
  if (body !== undefined) headers.set('content-type', 'application/json')

  const res = await fetch(`${API_BASE}${href(endpoint, params, query)}`, {
    method: endpoint.method,
    headers,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    ...(options?.signal ? { signal: options.signal } : {}),
  })

  const text = res.status === 204 ? '' : await res.text()
  if (!res.ok) {
    const refusal = parseProblem(text)
    throw new ApiError(
      res.status,
      refusal?.title ?? `HTTP ${res.status}`,
      refusal?.detail,
      refusal?.type,
    )
  }
  if (!endpoint.response) return undefined as ResponseOf<E>
  // A response schema drops fields it does not know: a page left open across a deploy meets fields
  // added since it was built, and they are not a reason to fail. Any other mismatch is.
  const answer = endpoint.response.safeParse(JSON.parse(text))
  if (!answer.success) throw new OutdatedPageError(endpoint.method !== 'GET')
  return answer.data as ResponseOf<E>
}

/**
 * Every page of a list, read in turn from the first: what a screen showing the whole list asks
 * for, so a list longer than one page is never cut short without anyone saying so. Once `signal`
 * aborts, no further page is asked for.
 */
export async function everyPage<P extends { page: PageInfo }>(
  read: (cursor: string | undefined) => Promise<P>,
  signal?: AbortSignal,
): Promise<P[]> {
  const pages: P[] = []
  let cursor: string | undefined
  do {
    signal?.throwIfAborted()
    const one = await read(cursor)
    pages.push(one)
    cursor = one.page.nextCursor ?? undefined
  } while (cursor !== undefined)
  return pages
}

/**
 * What a refusal says: the type, title and detail of problem+json, read loosely, since a proxy in front
 * of the API may answer with less. Null when the body is not JSON at all.
 */
const refusalText = z.object({
  type: z.string().optional(),
  title: z.string().optional(),
  detail: z.string().optional(),
})

function parseProblem(text: string): z.infer<typeof refusalText> | null {
  try {
    return refusalText.safeParse(JSON.parse(text)).data ?? null
  } catch {
    return null
  }
}
