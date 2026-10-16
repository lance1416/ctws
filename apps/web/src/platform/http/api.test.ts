import { api } from '@ctws/contracts'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError, call, everyPage, OutdatedPageError } from './api'

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

  it('reads an answer that has gained fields, as a page left open meets a newer server', async () => {
    const project = {
      id: ME.workspaceId,
      workspaceId: ME.workspaceId,
      name: 'P',
      color: 'project-2',
      isInbox: false,
      rank: 'a0',
      archivedAt: null,
      createdAt: '2026-10-01T00:00:00.000Z',
      columns: {},
    }
    const page = { limit: 200, nextCursor: null }
    const newer = { projects: [{ ...project, pinned: true }], page: { ...page, total: 1 }, more: 1 }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json(newer)))
    expect(await call(api.projects.list)).toEqual({ projects: [project], page })
  })

  it('says the page is out of date, not that the request failed, when a success no longer fits', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({ ...ME, role: 'owner' }, 201)))
    const failure = await call(api.auth.me).catch((e: unknown) => e)
    expect(failure).toBeInstanceOf(OutdatedPageError)
    expect((failure as Error).message).toMatch(/reload/i)
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

describe('everyPage', () => {
  it('reads from the first page until one says there is no next', async () => {
    const page = (nextCursor: string | null) => ({ page: { limit: 2, nextCursor } })
    const read = vi
      .fn<(cursor: string | undefined) => Promise<ReturnType<typeof page> & { rows: number[] }>>()
      .mockResolvedValueOnce({ ...page('2'), rows: [1, 2] })
      .mockResolvedValueOnce({ ...page('4'), rows: [3, 4] })
      .mockResolvedValueOnce({ ...page(null), rows: [5] })
    const pages = await everyPage(read)
    expect(pages.flatMap((p) => p.rows)).toEqual([1, 2, 3, 4, 5])
    expect(read.mock.calls).toEqual([[undefined], ['2'], ['4']])
  })

  it('asks once when the first page is the whole list', async () => {
    const read = vi.fn().mockResolvedValue({ page: { limit: 200, nextCursor: null }, rows: [] })
    expect(await everyPage(read)).toHaveLength(1)
    expect(read).toHaveBeenCalledTimes(1)
  })
})
