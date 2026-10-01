import { afterEach, describe, expect, it, vi } from 'vitest'
import { apiFetch } from './api'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('apiFetch', () => {
  it('sends credentials so the session cookie travels cross-origin', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    await apiFetch('/auth/me')

    const init = fetchMock.mock.calls[0]![1] as RequestInit
    expect(init.credentials).toBe('include')
  })

  it('sends the CSRF header on every request', async () => {
    // A fresh Response per call: a body can only be read once.
    const fetchMock = vi.fn().mockImplementation(async () => new Response('{}', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    await apiFetch('/auth/logout', { method: 'POST' })
    await apiFetch('/auth/me')

    for (const call of fetchMock.mock.calls) {
      const init = call[1] as RequestInit
      expect(new Headers(init.headers).get('x-ctws-client')).toBe('web')
    }
  })

  it('throws with the problem title when the response is a problem document', async () => {
    const body = JSON.stringify({
      type: 'about:blank',
      title: 'Registration is closed',
      status: 403,
    })
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(body, {
          status: 403,
          headers: { 'content-type': 'application/problem+json' },
        }),
      ),
    )

    await expect(apiFetch('/auth/register', { method: 'POST' })).rejects.toThrow(
      'Registration is closed',
    )
  })

  it('returns undefined for a 204 instead of failing to parse JSON', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 204 })))
    await expect(apiFetch('/auth/logout', { method: 'POST' })).resolves.toBeUndefined()
  })
})

describe('API base', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  it('defaults to the same-origin /api/v1 path', async () => {
    vi.stubEnv('VITE_API_BASE', undefined)
    vi.resetModules()
    const { apiFetch: fresh } = await import('./api')
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    await fresh('/auth/me')

    expect(fetchMock.mock.calls[0]![0]).toBe('/api/v1/auth/me')
  })

  it('honours VITE_API_BASE for a split deployment', async () => {
    vi.stubEnv('VITE_API_BASE', 'https://api.example.test/api/v1')
    vi.resetModules()
    const { apiFetch: fresh } = await import('./api')
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    await fresh('/auth/me')

    expect(fetchMock.mock.calls[0]![0]).toBe('https://api.example.test/api/v1/auth/me')
  })
})
