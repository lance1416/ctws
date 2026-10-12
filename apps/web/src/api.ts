import type { CalendarEntry } from '@ctws/contracts'
import type { Problem } from '@ctws/contracts'

const BASE = import.meta.env.VITE_API_BASE ?? '/api/v1'

/**
 * A failed request, with the STATUS kept.
 *
 * The server's `title` is a developer's sentence in English; a caller that wants to say something
 * to the person in front of it needs to know WHICH refusal it was, not how the API phrased it.
 * `message` is unchanged, so every existing `catch (e) { e.message }` reads the same.
 */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    /** problem+json 的 `detail`：这一条出了什么事，说给人看的那一句。 */
    readonly detail?: string,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

export async function apiFetch<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers)
  // The custom header is the client half of the CSRF scheme: the API rejects unsafe-method
  // requests that do not carry it.
  headers.set('x-ctws-client', 'web')
  if (init.body) headers.set('content-type', 'application/json')

  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers,
    // Needed only for a split deployment (cross-origin API); harmless same-origin.
    credentials: 'include',
  })

  // 204 (e.g. logout) has no body; do not try to parse it.
  if (res.status === 204) return undefined as T

  const text = await res.text()
  const body = text ? JSON.parse(text) : undefined

  if (!res.ok) {
    const problem = body as Problem | undefined
    throw new ApiError(res.status, problem?.title ?? `HTTP ${res.status}`, problem?.detail)
  }
  return body as T
}

/**
 * A MODULE'S DATED THINGS for a window.
 *
 * Every module with a calendar asks the same question of its own namespace, and all three wrote
 * the same four lines to do it. The DAY, the clock and the origin zone are all the SERVER's: a
 * client turning an instant into a day would put a 23:00 deadline on the wrong square for half
 * the world, which is the rule this one call exists to keep in one place.
 */
export async function calendarOf(
  base: string,
  range: { from: string; to: string },
): Promise<CalendarEntry[]> {
  const path = `${base}/calendar?from=${range.from}&to=${range.to}`
  return (await apiFetch<{ entries: CalendarEntry[] }>(path)).entries
}
