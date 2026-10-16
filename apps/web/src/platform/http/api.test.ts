import { api } from '@ctws/contracts'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError, call } from './api'

afterEach(() => {
  vi.unstubAllGlobals()
})

const ME = {
  id: '0190a7c2-6f00-7000-8000-000000000001',
  email: 'p@example.com',
  timezone: 'UTC',
  workspaceId: '0190a7c2-6f00-7000-8000-000000000002',
  role: 'member',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

describe('call', () => {
  it('calls the API on its own origin, at the path the table gives', async () => {
    const fetchMock = vi.fn().mockResolvedValue(json(ME))
    vi.stubGlobal('fetch', fetchMock)

    await call(api.auth.me)

    expect(fetchMock.mock.calls[0]![0]).toBe('/api/v1/auth/me')
    expect((fetchMock.mock.calls[0]![1] as RequestInit).method).toBe('GET')
  })

  it('fills path params and leaves undefined query values out', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }))
    vi.stubGlobal('fetch', fetchMock)

    await call(api.projects.remove, { params: { id: ME.workspaceId as never } })

    expect(fetchMock.mock.calls[0]![0]).toBe(`/api/v1/projects/${ME.workspaceId}`)
    expect((fetchMock.mock.calls[0]![1] as RequestInit).method).toBe('DELETE')
  })

  it('sends the CSRF header on every request', async () => {
    // A fresh Response per call: a body can only be read once.
    const fetchMock = vi.fn().mockImplementation(async () => json(ME))
    vi.stubGlobal('fetch', fetchMock)

    await call(api.auth.login, { body: { email: 'p@example.com', password: 'x' } })
    await call(api.auth.me)

    for (const c of fetchMock.mock.calls) {
      const init = c[1] as RequestInit
      expect(new Headers(init.headers).get('x-ctws-client')).toBe('web')
    }
  })

  it('parses the answer with the endpoint schema, refusing one that does not match', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({ ...ME, role: 'owner' })))
    await expect(call(api.auth.me)).rejects.toThrow()
  })

  it('keeps the status when an error body is not JSON', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('<html>Bad Gateway</html>', { status: 502 })),
    )
    const failure = await call(api.auth.me).catch((e: unknown) => e)
    expect(failure).toBeInstanceOf(ApiError)
    expect(failure).toMatchObject({ status: 502, message: 'HTTP 502' })
  })

  it('throws with the problem title when the response is a problem document', async () => {
    const body = { type: 'about:blank', title: 'Registration is closed', status: 403 }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json(body, 403)))

    await expect(
      call(api.auth.register, {
        body: { email: 'p@example.com', password: 'correct horse battery', timezone: 'UTC' },
      }),
    ).rejects.toThrow('Registration is closed')
  })

  it('returns undefined for a 204 instead of failing to parse JSON', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 204 })))
    await expect(call(api.auth.logout)).resolves.toBeUndefined()
  })
})
