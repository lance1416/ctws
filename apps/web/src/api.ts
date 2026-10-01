import type { Problem } from '@ctws/contracts'

const BASE = import.meta.env.VITE_API_BASE ?? '/api/v1'

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

  if (!res.ok) throw new Error((body as Problem | undefined)?.title ?? `HTTP ${res.status}`)
  return body as T
}
