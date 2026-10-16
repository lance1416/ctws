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
  ) {
    super(message)
    this.name = 'ApiError'
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

/**
 * Calls one endpoint of the table: the path is built from its params and query, the body is sent
 * as JSON, and the answer is parsed by the endpoint's own response schema, so what a caller gets
 * is what the contract says rather than what it is assumed to be.
 */
export async function call<E extends Endpoint>(
  endpoint: E,
  ...[input]: object extends RequestOf<E> ? [RequestOf<E>?] : [RequestOf<E>]
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
  })

  const text = res.status === 204 ? '' : await res.text()
  if (!res.ok) {
    const refusal = parseProblem(text)
    throw new ApiError(res.status, refusal?.title ?? `HTTP ${res.status}`, refusal?.detail)
  }
  return (
    endpoint.response ? endpoint.response.parse(JSON.parse(text)) : undefined
  ) as ResponseOf<E>
}

/**
 * Every page of a list, read in turn from the first: what a screen showing the whole list asks
 * for, so a list longer than one page is never cut short without anyone saying so.
 */
export async function everyPage<P extends { page: PageInfo }>(
  read: (cursor: string | undefined) => Promise<P>,
): Promise<P[]> {
  const pages: P[] = []
  let cursor: string | undefined
  do {
    const one = await read(cursor)
    pages.push(one)
    cursor = one.page.nextCursor ?? undefined
  } while (cursor !== undefined)
  return pages
}

/**
 * What a refusal says: the title and detail of problem+json, read loosely, since a proxy in front
 * of the API may answer with less. Null when the body is not JSON at all.
 */
const refusalText = z.object({ title: z.string().optional(), detail: z.string().optional() })

function parseProblem(text: string): z.infer<typeof refusalText> | null {
  try {
    return refusalText.safeParse(JSON.parse(text)).data ?? null
  } catch {
    return null
  }
}
