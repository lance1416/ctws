import type { ProjectId } from '@ctws/contracts'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { appWithUser, createProject, createTask, type Harness, web } from '../helpers/harness'

/**
 * A list that can grow without bound is read a page at a time: each answer says the limit it was
 * cut at and where the next page starts, and following the cursors gives every row once.
 */
let ctx: Harness
let projectId: ProjectId

beforeAll(async () => {
  ctx = await appWithUser('pages@example.com')
  projectId = await createProject(ctx, 'Paged')
  for (const n of [1, 2, 3, 4, 5]) {
    await createProject(ctx, `P${n}`)
    await post('/api/v1/people', { name: `Person ${n}` })
    await post('/api/v1/reading', { kind: 'book', title: `Book ${n}` })
    await createTask(ctx, projectId, `needle ${n}`)
    await post('/api/v1/meetings', {
      title: `Meeting ${n}`,
      startsLocal: `2026-10-2${n}T09:00`,
      timeZone: 'UTC',
      durationMinutes: 30,
    })
  }
}, 180_000)

afterAll(async () => {
  await ctx?.stop()
})

async function post(url: string, payload: object) {
  const res = await ctx.app.inject({ method: 'POST', url, headers: web(ctx), payload })
  expect(res.statusCode, res.body).toBe(201)
}

type Paged = { page: { limit: number; nextCursor: string | null } } & Record<string, unknown>

async function get(url: string): Promise<Paged> {
  const res = await ctx.app.inject({ method: 'GET', url, headers: ctx.authed })
  expect(res.statusCode, res.body).toBe(200)
  return res.json() as Paged
}

/** Every row of a list, by following its cursors with pages of two. */
async function follow(url: string, key: string): Promise<{ rows: unknown[]; pages: number }> {
  const join = url.includes('?') ? '&' : '?'
  const rows: unknown[] = []
  let pages = 0
  let cursor: string | null = null
  do {
    const one: Paged = await get(`${url}${join}limit=2${cursor ? `&cursor=${cursor}` : ''}`)
    expect(one.page.limit).toBe(2)
    rows.push(...(one[key] as unknown[]))
    cursor = one.page.nextCursor
    pages += 1
  } while (cursor)
  return { rows, pages }
}

const lists = [
  ['/api/v1/projects', 'projects'],
  ['/api/v1/people', 'people'],
  ['/api/v1/reading', 'reading'],
  ['/api/v1/tasks?q=needle', 'tasks'],
  ['/api/v1/people?q=Person', 'people'],
  ['/api/v1/reading?q=Book', 'reading'],
  ['/api/v1/meetings?from=2026-10-20&to=2026-10-31', 'meetings'],
  ['/api/v1/meetings?view=calendar&from=2026-10-20&to=2026-10-31', 'entries'],
] as const

describe.each(lists)('GET %s', (url, key) => {
  it('pages through the same rows the whole list holds, each once', async () => {
    const whole = await get(url)
    expect(whole.page.nextCursor).toBeNull()
    const paged = await follow(url, key)
    expect(paged.pages).toBeGreaterThan(1)
    expect(paged.rows).toEqual(whole[key])
  })

  it('refuses a limit over its own and a cursor it did not give out', async () => {
    const join = url.includes('?') ? '&' : '?'
    for (const bad of ['limit=0', 'limit=100000', 'cursor=abc', 'cursor=-1']) {
      const res = await ctx.app.inject({
        method: 'GET',
        url: `${url}${join}${bad}`,
        headers: ctx.authed,
      })
      expect(res.statusCode, bad).toBe(400)
    }
  })
})

describe('the page a list gives when none is asked for', () => {
  it.each([
    ['/api/v1/projects', 200],
    ['/api/v1/people', 200],
    ['/api/v1/reading', 200],
    ['/api/v1/admin/users', 200],
    ['/api/v1/tasks?view=completed', 200],
    ['/api/v1/tasks?q=needle', 50],
    ['/api/v1/people?q=Person', 20],
    ['/api/v1/reading?q=Book', 20],
    ['/api/v1/meetings?from=2026-10-20&to=2026-10-31', 500],
  ])('%s says its limit is %i', async (url, limit) => {
    expect((await get(url)).page.limit).toBe(limit)
  })
})
