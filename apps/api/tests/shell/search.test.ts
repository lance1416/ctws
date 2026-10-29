import type { SearchEverythingResponse } from '@ctws/contracts'
import { afterEach, describe, expect, it } from 'vitest'
import { createPerson, createProject, createTask } from '../helpers/builders'
import { appWithUser, secondUser, web, type Harness } from '../helpers/harness'

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

  it('names an untitled note on a meeting by the meeting and that day (FR-050)', async () => {
    const ctx = await setup()
    const post = async (url: string, payload: object) => {
      const res = await ctx.app.inject({ method: 'POST', url, headers: web(ctx), payload })
      expect(res.statusCode, res.body).toBeLessThan(300)
      return res.json() as Record<string, string>
    }
    const m = await post('/api/v1/meetings', {
      title: 'Atlas weekly',
      startsLocal: '2026-10-19T09:00',
      timeZone: 'Europe/London',
      durationMinutes: 45,
    })
    await post('/api/v1/notes', {
      title: null,
      body: '## Updates\n\nThe importer ships Friday.',
      anchor: { type: 'meeting', id: m.meetingId, occurrenceId: '2026-10-19T09:00' },
    })
    await post('/api/v1/notes', { title: 'Importer plan', body: 'The importer, step by step.' })
    const body = await search(ctx, 'q=importer&kind=note')
    expect(body.groups[0]!.items.map((i) => i.title).sort()).toEqual([
      'Atlas weekly, Oct 19',
      'Importer plan',
    ])
    // Called by the meeting's name, it is found by it too, and counted; the meeting as well.
    const byName = await search(ctx, 'q=atlas%20weekly')
    const notes = byName.groups.find((g) => g.type === 'note')!
    expect(notes.items.map((i) => i.title)).toEqual(['Atlas weekly, Oct 19'])
    expect(notes.total).toBe(1)
    expect(byName.groups.find((g) => g.type === 'meeting')!.items.map((i) => i.title)).toEqual([
      'Atlas weekly',
    ])
  })
})

describe('how matches rank (FR-024, BUG-087)', () => {
  const people = (body: SearchEverythingResponse) =>
    body.groups.find((g) => g.type === 'person')?.items.map((i) => i.title) ?? []

  it('puts a name it starts first, then one a word of starts, then one with it inside', async () => {
    const ctx = await setup()
    for (const name of ['Femi Ford', 'Femi Gill', 'Ami Mirza', 'Mira Chen'])
      await createPerson(ctx, { name })
    // An alias that starts so counts as the name starting so: 李雯 goes by Wendy.
    await createPerson(ctx, { name: '李雯', aliases: [{ name: 'Mimi Li' }] })
    expect(people(await search(ctx, 'q=mi'))).toEqual([
      'Mira Chen',
      '李雯',
      'Ami Mirza',
      'Femi Ford',
      'Femi Gill',
    ])
  })

  it('puts what was opened lately first among equally good matches', async () => {
    const ctx = await setup()
    await createPerson(ctx, { name: 'Mira Chen' })
    const later = await createPerson(ctx, { name: 'Miles Park' })
    const femi = await createPerson(ctx, { name: 'Femi Ford' })
    // Opened lately, newest first: Femi then Miles. Femi stays behind both who start "Mi".
    const recent = [femi.id, later.id].join(',')
    expect(people(await search(ctx, `q=mi&recent=${recent}`))).toEqual([
      'Miles Park',
      'Mira Chen',
      'Femi Ford',
    ])
  })
})
