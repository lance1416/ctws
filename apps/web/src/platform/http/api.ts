import type { CalendarEntry, Problem } from '@ctws/contracts'

const BASE = '/api/v1'

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

/** What to tell a person about a failed write: the server's sentence for them, else its title. */
export function problemText(error: Error | null): string | null {
  if (!error) return null
  return error instanceof ApiError ? (error.detail ?? error.message) : error.message
}

export async function apiFetch<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers)
  // The client half of the CSRF check: the API refuses unsafe methods without it.
  headers.set('x-ctws-client', 'web')
  if (init.body) headers.set('content-type', 'application/json')

  const res = await fetch(`${BASE}${path}`, { ...init, headers })

  if (res.status === 204) return undefined as T

  const text = await res.text()
  if (!res.ok) {
    const problem = parseProblem(text)
    throw new ApiError(res.status, problem?.title ?? `HTTP ${res.status}`, problem?.detail)
  }
  return (text ? JSON.parse(text) : undefined) as T
}

/** An error body as problem+json, or null when a proxy answered with something else. */
function parseProblem(text: string): Problem | null {
  try {
    return text ? (JSON.parse(text) as Problem) : null
  } catch {
    return null
  }
}

/** A module's dated things for an inclusive day range; the server decides each entry's day. */
export async function calendarOf(
  base: string,
  range: { from: string; to: string },
): Promise<CalendarEntry[]> {
  const path = `${base}/calendar?from=${range.from}&to=${range.to}`
  return (await apiFetch<{ entries: CalendarEntry[] }>(path)).entries
}
