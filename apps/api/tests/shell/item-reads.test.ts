import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { appWithUser, createProject, type Harness, web } from '../helpers/harness'

/**
 * Every collection whose items have ids answers for one item at `/<collection>/:id`, with the
 * shape its list gives that item. A deleted item and another workspace's are both a 404.
 */
let ctx: Harness
let intruder: Record<string, string>

beforeAll(async () => {
  ctx = await appWithUser('reads@example.com')
  const res = await ctx.app.inject({
    method: 'POST',
    url: '/api/v1/auth/register',
    headers: { 'x-ctws-client': 'web' },
    payload: { email: 'other@example.com', password: 'correct horse battery', timezone: 'UTC' },
  })
  intruder = { 'x-ctws-client': 'web', cookie: String(res.headers['set-cookie']).split(';')[0]! }
}, 180_000)

afterAll(async () => {
  await ctx?.stop()
})

const get = (url: string, headers = ctx.authed) => ctx.app.inject({ method: 'GET', url, headers })
const post = async (url: string, payload: object) => {
  const res = await ctx.app.inject({ method: 'POST', url, headers: web(ctx), payload })
  expect(res.statusCode, res.body).toBe(201)
  return res.json() as { id: string }
}

const cases = [
  {
    name: 'a project',
    collection: '/api/v1/projects',
    make: async () => ({ id: await createProject(ctx, 'One') }),
    listed: async (id: string) =>
      (await get('/api/v1/projects')).json().projects.find((p: { id: string }) => p.id === id),
  },
  {
    name: 'a person',
    collection: '/api/v1/people',
    make: () => post('/api/v1/people', { name: 'Ying' }),
    listed: async (id: string) =>
      (await get('/api/v1/people')).json().people.find((p: { id: string }) => p.id === id),
  },
  {
    name: 'a reading item',
    collection: '/api/v1/reading',
    make: () => post('/api/v1/reading', { kind: 'book', title: 'Dune' }),
    listed: async (id: string) =>
      (await get('/api/v1/reading')).json().reading.find((p: { id: string }) => p.id === id),
  },
]

describe.each(cases)('reading $name by its id', ({ collection, make, listed }) => {
  it('answers with what the list says about it', async () => {
    const { id } = await make()
    const one = await get(`${collection}/${id}`)
    expect(one.statusCode).toBe(200)
    expect(one.json()).toEqual(await listed(id))
  })

  it('is a 404 in another workspace and once deleted', async () => {
    const { id } = await make()
    expect((await get(`${collection}/${id}`, intruder)).statusCode).toBe(404)
    await ctx.app.inject({ method: 'DELETE', url: `${collection}/${id}`, headers: web(ctx) })
    expect((await get(`${collection}/${id}`)).statusCode).toBe(404)
  })
})

describe('a create says where the new thing is read', () => {
  it.each([
    ['/api/v1/projects', { name: 'P' }],
    ['/api/v1/people', { name: 'Ying' }],
    ['/api/v1/reading', { kind: 'book', title: 'Dune' }],
  ])('POST %s answers 201 with a Location that reads it', async (collection, payload) => {
    const res = await ctx.app.inject({
      method: 'POST',
      url: collection,
      headers: web(ctx),
      payload,
    })
    expect(res.statusCode).toBe(201)
    expect(res.headers.location).toBe(`${collection}/${res.json().id}`)
    expect((await get(String(res.headers.location))).statusCode).toBe(200)
  })

  it('does so for a task', async () => {
    const projectId = await createProject(ctx, 'T')
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/tasks',
      headers: web(ctx),
      payload: { projectId, title: 'x' },
    })
    expect(res.headers.location).toBe(`/api/v1/tasks/${res.json().id}`)
    expect((await get(String(res.headers.location))).json()).toEqual(res.json())
  })

  it('does so for a meeting', async () => {
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/meetings',
      headers: web(ctx),
      payload: {
        title: 'Standup',
        startsLocal: '2026-10-20T09:00',
        timeZone: 'UTC',
        durationMinutes: 15,
      },
    })
    expect(res.statusCode).toBe(201)
    expect((await get(String(res.headers.location))).json()).toEqual(res.json())
  })
})
