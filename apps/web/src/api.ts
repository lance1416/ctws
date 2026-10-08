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
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

export async function apiFetch<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers)
  // The custom header is the client half of the CSRF scheme (spec section 10.3):
  // the API rejects unsafe-method requests that do not carry it.
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
    throw new ApiError(res.status, (body as Problem | undefined)?.title ?? `HTTP ${res.status}`)
  }
  return body as T
}
