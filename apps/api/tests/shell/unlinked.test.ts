import { afterEach, describe, expect, it } from 'vitest'
import { createPerson, createProject, createTask } from '../helpers/builders'
import { secondUser, setupWith, type Harness } from '../helpers/harness'

/**
 * "Mentioned without @": where a person, project or organisation is named in notes, task notes
 * and messages without a mention, turned into one with "Link" or let be with "Not this one".
 */

const cleanups: (() => Promise<void>)[] = []
afterEach(async () => {
  for (const stop of cleanups.splice(0)) await stop()
})

const setup = () => setupWith(cleanups, 'me@example.com')

const call = (ctx: Harness, method: 'GET' | 'POST', url: string, payload?: object) =>
  ctx.app.inject({
    method,
    url: `/api/v1${url}`,
    headers: ctx.authed,
    ...(payload ? { payload } : {}),
  })

const note = async (ctx: Harness, body: string) =>
  (await call(ctx, 'POST', '/notes', { body })).json().id as string

const unlinked = async (ctx: Harness, type: string, id: string) =>
  (await call(ctx, 'GET', `/unlinked/${type}/${id}`)).json()

describe('a person named without @', () => {
  it('is found in a note, turned into a mention by Link, and then listed no more', async () => {
    const ctx = await setup()
    const lena = await createPerson(ctx, { name: 'Lena Fischer' })
    const id = await note(ctx, 'Lunch with Lena Fischer next week. Then the gym.')
    const found = await unlinked(ctx, 'person', lena.id)
    expect(found).toEqual({
      items: [
        {
          source: expect.objectContaining({ type: 'note', id }),
          excerpt: 'Lunch with Lena Fischer next week.',
          start: 11,
          end: 23,
        },
      ],
      total: 1,
    })
    const { source, ...place } = found.items[0]
    const link = await call(ctx, 'POST', `/unlinked/person/${lena.id}/link`, {
      source: { type: source.type, id: source.id },
      ...place,
    })
    expect(link.statusCode, link.body).toBe(204)
    expect((await call(ctx, 'GET', `/notes/${id}`)).json().body).toBe(
      `Lunch with [@Lena Fischer](ctws://person/${lena.id}) next week. Then the gym.`,
    )
    expect(await unlinked(ctx, 'person', lena.id)).toEqual({ items: [], total: 0 })
    // And it is a mention now: her page has the sentence.
    const related = await call(ctx, 'GET', `/relations?type=person&id=${lena.id}`)
    expect(related.body).toContain(id)
  })

  it('is found by her other names too, in task notes and in messages', async () => {
    const ctx = await setup()
    const lena = await createPerson(ctx, {
      name: 'Lena Fischer',
      aliases: [{ name: 'Leni' }],
    })
    const p = await createProject(ctx, 'Home')
    const task = await createTask(ctx, p, 'Plan', undefined, { notes: 'Ask Leni about dates.' })
    await call(ctx, 'POST', '/communication', {
      direction: 'sent',
      channel: 'email',
      parties: [{ type: 'person', id: lena.id }],
      body: 'Forwarded to lena fischer as well.',
    })
    const { items } = await unlinked(ctx, 'person', lena.id)
    expect(items.map((i: { source: { type: string } }) => i.source.type).sort()).toEqual([
      'communication',
      'task',
    ])
    expect(items.find((i: { source: { id: string } }) => i.source.id === task)).toMatchObject({
      excerpt: 'Ask Leni about dates.',
    })
  })

  it('is not found where the sentence mentions her already', async () => {
    const ctx = await setup()
    const lena = await createPerson(ctx, { name: 'Lena Fischer' })
    await note(ctx, `[@Lena Fischer](ctws://person/${lena.id}) and Lena Fischer again.`)
    expect(await unlinked(ctx, 'person', lena.id)).toEqual({ items: [], total: 0 })
  })

  it('is not looked for when the name is too short', async () => {
    const ctx = await setup()
    const al = await createPerson(ctx, { name: 'Al' })
    await note(ctx, 'Al came by.')
    expect(await unlinked(ctx, 'person', al.id)).toEqual({ items: [], total: 0 })
  })
})

describe('a project named without @', () => {
  it('is let be with Not this one, and stays so', async () => {
    const ctx = await setup()
    const atlas = await createProject(ctx, 'Atlas')
    await note(ctx, 'Bought a new atlas of the world.')
    const { items } = await unlinked(ctx, 'project', atlas)
    expect(items).toHaveLength(1)
    const { source, ...place } = items[0]
    const res = await call(ctx, 'POST', `/unlinked/project/${atlas}/dismiss`, {
      source: { type: source.type, id: source.id },
      ...place,
    })
    expect(res.statusCode).toBe(204)
    expect(await unlinked(ctx, 'project', atlas)).toEqual({ items: [], total: 0 })
  })
})

describe('Link on a place that moved', () => {
  it('is refused, and the text is left as it is', async () => {
    const ctx = await setup()
    const lena = await createPerson(ctx, { name: 'Lena Fischer' })
    const id = await note(ctx, 'Lunch with Lena Fischer next week.')
    const res = await call(ctx, 'POST', `/unlinked/person/${lena.id}/link`, {
      source: { type: 'note', id },
      excerpt: 'Dinner with Lena Fischer next week.',
      start: 12,
      end: 24,
    })
    expect(res.statusCode).toBe(409)
    expect(res.json()).toMatchObject({ type: 'urn:ctws:problem:unlinked-place-moved' })
    expect((await call(ctx, 'GET', `/notes/${id}`)).json().body).toBe(
      'Lunch with Lena Fischer next week.',
    )
  })
})

describe('another workspace', () => {
  it('neither finds nor links what it does not see', async () => {
    const ctx = await setup()
    const lena = await createPerson(ctx, { name: 'Lena Fischer' })
    await note(ctx, 'Lunch with Lena Fischer.')
    const other = await secondUser(ctx)
    expect((await call(other, 'GET', `/unlinked/person/${lena.id}`)).statusCode).toBe(404)
    const theirs = await createPerson(other, { name: 'Lena Fischer' })
    expect(await unlinked(other, 'person', theirs.id)).toEqual({ items: [], total: 0 })
  })
})
