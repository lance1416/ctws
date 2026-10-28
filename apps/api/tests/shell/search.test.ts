import type { SearchEverythingResponse } from '@ctws/contracts'
import { afterEach, describe, expect, it } from 'vitest'
import { createPerson, createProject, createTask } from '../helpers/builders'
import { appWithUser, secondUser, type Harness } from '../helpers/harness'

/**
 * ONE SEARCH FOR EVERYTHING (FR-024, `GET /search`): every kind's first five and how many there
 * are, in the fixed order; or one kind, a page at a time. Each kind's module reads the text its
 * own way: a person by an alias too.
 */

const cleanups: (() => Promise<void>)[] = []
afterEach(async () => {
  for (const stop of cleanups.splice(0)) await stop()
})

async function setup(): Promise<Harness> {
  const ctx = await appWithUser()
  cleanups.push(ctx.stop)
  return ctx
}

async function search(ctx: Harness, query: string): Promise<SearchEverythingResponse> {
  const res = await ctx.app.inject({
    method: 'GET',
    url: `/api/v1/search?${query}`,
    headers: ctx.authed,
  })
  expect(res.statusCode, res.body).toBe(200)
  return res.json() as SearchEverythingResponse
}

describe('GET /search', () => {
  it('gives each kind its first five and its total, people first', async () => {
    const ctx = await setup()
    for (let i = 1; i <= 7; i++) await createPerson(ctx, { name: `Stripe contact ${i}` })
    const pid = await createProject(ctx, 'Stripe onsite')
    await createTask(ctx, pid, 'Stripe take-home')
    const body = await search(ctx, 'q=stripe')
    expect(body.groups.map((g) => [g.type, g.total, g.items.length])).toEqual([
      ['person', 7, 5],
      ['task', 1, 1],
      ['project', 1, 1],
    ])
    expect(body.page).toBeNull()
  })

  it('pages through one kind, all of it', async () => {
    const ctx = await setup()
    for (let i = 1; i <= 7; i++) await createPerson(ctx, { name: `Stripe contact ${i}` })
    const first = await search(ctx, 'q=stripe&kind=person&limit=4')
    expect(first.groups[0]!.total).toBe(7)
    expect(first.groups[0]!.items).toHaveLength(4)
    const next = await search(ctx, `q=stripe&kind=person&limit=4&cursor=${first.page!.nextCursor}`)
    expect(next.groups[0]!.items).toHaveLength(3)
    expect(next.page!.nextCursor).toBeNull()
    const ids = [...first.groups[0]!.items, ...next.groups[0]!.items].map((p) => p.id)
    expect(new Set(ids).size).toBe(7)
  })

  it('finds a person by an alias', async () => {
    const ctx = await setup()
    await createPerson(ctx, { name: '李雯', aliases: [{ name: 'Wendy', label: null }] })
    const body = await search(ctx, 'q=wendy')
    expect(body.groups).toEqual([
      expect.objectContaining({
        type: 'person',
        total: 1,
        items: [expect.objectContaining({ title: '李雯' })],
      }),
    ])
  })

  it('keeps one workspace out of another', async () => {
    const ctx = await setup()
    await createPerson(ctx, { name: 'Stripe contact' })
    const theirs = await secondUser(ctx)
    expect((await search(theirs, 'q=stripe')).groups).toEqual([])
  })
})
