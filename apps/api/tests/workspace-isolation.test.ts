import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { withApp } from './helpers/app'

let ctx: Awaited<ReturnType<typeof withApp>>

beforeAll(async () => {
  ctx = await withApp()
}, 120_000)

afterAll(async () => {
  await ctx?.stop()
})

const headers = { 'x-ctws-client': 'web', origin: 'http://localhost:5173' }

async function registerUser(email: string) {
  const res = await ctx.app.inject({
    method: 'POST',
    url: '/api/v1/auth/register',
    headers,
    payload: { email, password: 'correct horse battery', timezone: 'UTC' },
  })
  expect(res.statusCode).toBe(201)
  return String(res.headers['set-cookie']).split(';')[0]!
}

async function me(cookie: string) {
  const res = await ctx.app.inject({
    method: 'GET',
    url: '/api/v1/auth/me',
    headers: { cookie },
  })
  expect(res.statusCode).toBe(200)
  return res.json() as { email: string; workspaceId: string }
}

// Spec section 10.5 / 13.2: with several users in one database, each session must resolve
// to its own workspace. A single-user test cannot catch a missing membership filter.
describe('workspace isolation', () => {
  it('resolves each session to its own user and workspace', async () => {
    const cookieA = await registerUser('a@example.com')
    const cookieB = await registerUser('b@example.com')

    const a = await me(cookieA)
    const b = await me(cookieB)

    expect(a.email).toBe('a@example.com')
    expect(b.email).toBe('b@example.com')
    expect(a.workspaceId).not.toBe(b.workspaceId)

    // A's cookie must never resolve to B's workspace, and vice versa.
    const again = await me(cookieA)
    expect(again.workspaceId).toBe(a.workspaceId)
    expect(again.workspaceId).not.toBe(b.workspaceId)
    expect((await me(cookieB)).workspaceId).toBe(b.workspaceId)
  })
})
