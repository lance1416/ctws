import type { ResourceResponse } from '@ctws/contracts'
import { afterEach, describe, expect, it } from 'vitest'
import { createProject, createTask } from '../helpers/builders'
import { appWithUser, eventsOf, type Harness, secondUser } from '../helpers/harness'

/**
 * Resources: an outside address on any thing, with an optional name; a project pins up to nine of
 * its own in its head, one per digit key.
 */
const cleanups: (() => Promise<void>)[] = []
afterEach(async () => {
  for (const stop of cleanups.splice(0)) await stop()
})

async function setup() {
  const ctx = await appWithUser()
  cleanups.push(ctx.stop)
  const projectId = await createProject(ctx, 'Job hunt')
  const task = await createTask(ctx, projectId, 'Prepare the system design round')
  return { ctx, projectId, task }
}

const add = (ctx: Harness, owner: object, url: string, name?: string) =>
  ctx.app.inject({
    method: 'POST',
    url: '/api/v1/resources',
    headers: ctx.authed,
    payload: { owner, url, ...(name ? { name } : {}) },
  })

async function listed(ctx: Harness, type: string, id: string): Promise<ResourceResponse[]> {
  const res = await ctx.app.inject({
    method: 'GET',
    url: `/api/v1/resources?type=${type}&id=${id}`,
    headers: ctx.authed,
  })
  expect(res.statusCode, res.body).toBe(200)
  return (res.json() as { resources: ResourceResponse[] }).resources
}

describe('resources', () => {
  it('hang on a thing in the order they were put, and are logged on it', async () => {
    const { ctx, task } = await setup()
    const owner = { type: 'task', id: task }
    expect(
      (await add(ctx, owner, 'https://docs.google.com/document/d/abc/edit', 'System design prep'))
        .statusCode,
    ).toBe(201)
    expect((await add(ctx, owner, 'https://github.com/ctws/ctws/pull/123')).statusCode).toBe(201)
    const rows = await listed(ctx, 'task', task)
    expect(rows.map((r) => [r.name, r.url])).toEqual([
      ['System design prep', 'https://docs.google.com/document/d/abc/edit'],
      [null, 'https://github.com/ctws/ctws/pull/123'],
    ])
    expect((await eventsOf(ctx, task)).map((e) => e.type)).toContain('resource_added')
  })

  it('refuses an address that is not http(s), and an owner from another workspace', async () => {
    const { ctx, task } = await setup()
    expect((await add(ctx, { type: 'task', id: task }, 'ftp://example.com/x')).statusCode).toBe(400)
    const other = await secondUser(ctx)
    expect((await add(other, { type: 'task', id: task }, 'https://example.com')).statusCode).toBe(
      404,
    )
  })

  it('can be renamed and removed', async () => {
    const { ctx, task } = await setup()
    const { id } = (await add(ctx, { type: 'task', id: task }, 'https://example.com/a')).json()
    const renamed = await ctx.app.inject({
      method: 'PATCH',
      url: `/api/v1/resources/${id}`,
      headers: ctx.authed,
      payload: { name: 'The spec' },
    })
    expect(renamed.statusCode, renamed.body).toBe(200)
    expect(renamed.json().name).toBe('The spec')
    const gone = await ctx.app.inject({
      method: 'DELETE',
      url: `/api/v1/resources/${id}`,
      headers: ctx.authed,
    })
    expect(gone.statusCode).toBe(204)
    expect(await listed(ctx, 'task', task)).toEqual([])
    expect((await eventsOf(ctx, task)).map((e) => e.type)).toContain('resource_removed')
  })
})

describe('a project pins resources in its head', () => {
  it('numbers them 1 to 9, one per key, and only on a project', async () => {
    const { ctx, projectId, task } = await setup()
    const owner = { type: 'project', id: projectId }
    const a = (
      await add(ctx, owner, 'https://drive.google.com/drive/folders/x', 'Applications')
    ).json()
    const b = (await add(ctx, owner, 'https://docs.google.com/document/d/cv', 'CV master')).json()
    const pin = (id: string, pinnedRank: number | null) =>
      ctx.app.inject({
        method: 'PATCH',
        url: `/api/v1/resources/${id}`,
        headers: ctx.authed,
        payload: { pinnedRank },
      })

    expect((await pin(a.id, 1)).statusCode).toBe(200)
    expect((await pin(b.id, 2)).statusCode).toBe(200)
    // The key is taken.
    expect((await pin(b.id, 1)).statusCode).toBe(409)
    // Out of the digit keys.
    expect((await pin(b.id, 10)).statusCode).toBe(400)
    // Only a project has a head to pin in.
    const onTask = (await add(ctx, { type: 'task', id: task }, 'https://example.com')).json()
    expect((await pin(onTask.id, 1)).statusCode).toBe(422)

    expect((await listed(ctx, 'project', projectId)).map((r) => [r.name, r.pinnedRank])).toEqual([
      ['Applications', 1],
      ['CV master', 2],
    ])
    expect((await pin(a.id, null)).statusCode).toBe(200)
    expect((await listed(ctx, 'project', projectId)).map((r) => r.pinnedRank)).toEqual([null, 2])
  })

  it('gathers what the projects still worked on pin, by project and then by digit', async () => {
    const { ctx, projectId } = await setup()
    const later = await createProject(ctx, 'Moving flat')
    const shelved = await createProject(ctx, 'Old course')
    const pinAt = async (project: string, url: string, name: string, pinnedRank: number) => {
      const made = (await add(ctx, { type: 'project', id: project }, url, name)).json()
      await ctx.app.inject({
        method: 'PATCH',
        url: `/api/v1/resources/${made.id}`,
        headers: ctx.authed,
        payload: { pinnedRank },
      })
    }
    await pinAt(later, 'https://docs.google.com/spreadsheets/d/budget', 'Budget', 1)
    await pinAt(projectId, 'https://www.overleaf.com/project/cl', 'Cover letters', 2)
    await pinAt(projectId, 'https://docs.google.com/document/d/cv', 'CV master', 1)
    await pinAt(shelved, 'https://example.com/notes', 'Course notes', 1)
    // Hung on the project but not pinned: not in its head, so not in the launcher.
    await add(ctx, { type: 'project', id: projectId }, 'https://example.com/loose', 'Loose')
    await ctx.app.inject({
      method: 'PATCH',
      url: `/api/v1/projects/${shelved}`,
      headers: ctx.authed,
      payload: { archived: true },
    })

    const res = await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/resources/pinned',
      headers: ctx.authed,
    })
    expect(res.statusCode, res.body).toBe(200)
    expect((res.json() as { resources: ResourceResponse[] }).resources.map((r) => r.name)).toEqual([
      'CV master',
      'Cover letters',
      'Budget',
    ])

    // Another workspace sees none of them.
    const other = await secondUser(ctx)
    const theirs = await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/resources/pinned',
      headers: other.authed,
    })
    expect((theirs.json() as { resources: ResourceResponse[] }).resources).toEqual([])
  })
})

describe('dragging a resource', () => {
  const move = (ctx: Harness, id: string, payload: object) =>
    ctx.app.inject({
      method: 'PATCH',
      url: `/api/v1/resources/${id}`,
      headers: ctx.authed,
      payload,
    })

  async function three() {
    const { ctx, projectId } = await setup()
    const owner = { type: 'project', id: projectId }
    const ids: string[] = []
    for (const n of ['a', 'b', 'c']) {
      ids.push((await add(ctx, owner, `https://example.com/${n}`, n)).json().id)
    }
    const order = async () => (await listed(ctx, 'project', projectId)).map((r) => r.name)
    return { ctx, projectId, ids: ids as [string, string, string], order }
  }

  it('puts it before or after the one it was dropped by, and nothing else moves', async () => {
    const { ctx, ids, order } = await three()
    expect((await move(ctx, ids[2], { beforeId: ids[0] })).statusCode).toBe(200)
    expect(await order()).toEqual(['c', 'a', 'b'])
    expect((await move(ctx, ids[2], { afterId: ids[1] })).statusCode).toBe(200)
    expect(await order()).toEqual(['a', 'b', 'c'])
    expect((await move(ctx, ids[0], { afterId: ids[1] })).statusCode).toBe(200)
    expect(await order()).toEqual(['b', 'a', 'c'])
  })

  it("refuses a neighbour that is not one of the same thing's, and both at once", async () => {
    const { ctx, ids, order } = await three()
    const { projectId: elsewhere } = { projectId: await createProject(ctx, 'Elsewhere') }
    const theirs = (
      await add(ctx, { type: 'project', id: elsewhere }, 'https://example.com/x')
    ).json()
    expect((await move(ctx, ids[0], { afterId: theirs.id })).statusCode).toBe(422)
    expect((await move(ctx, ids[0], { beforeId: ids[1], afterId: ids[2] })).statusCode).toBe(400)
    expect(await order()).toEqual(['a', 'b', 'c'])
  })
})

describe('an address', () => {
  it('is https when written without its scheme, and refused when it is another scheme', async () => {
    const { ctx, task } = await setup()
    const owner = { type: 'task', id: task }
    const made = await add(ctx, owner, 'example.com/docs')
    expect(made.statusCode, made.body).toBe(201)
    expect(made.json().url).toBe('https://example.com/docs')
    expect((await add(ctx, owner, 'localhost:3000/x')).json().url).toBe('https://localhost:3000/x')
    expect((await add(ctx, owner, 'javascript:alert(1)')).statusCode).toBe(400)
    expect((await add(ctx, owner, 'mailto:a@example.com')).statusCode).toBe(400)
  })

  it('is kept once on a thing: the same address again is that resource, answered 200', async () => {
    const { ctx, task } = await setup()
    const owner = { type: 'task', id: task }
    const first = await add(ctx, owner, 'https://example.com/docs', 'Docs')
    const again = await add(ctx, owner, 'EXAMPLE.com/docs')
    expect(again.statusCode).toBe(200)
    expect(again.json().id).toBe(first.json().id)
    expect(await listed(ctx, 'task', task)).toHaveLength(1)
    // On another thing it is its own.
    const other = await createTask(ctx, await createProject(ctx, 'Other'), 'Other task')
    expect(
      (await add(ctx, { type: 'task', id: other }, 'https://example.com/docs')).statusCode,
    ).toBe(201)
  })

  it('cannot be changed to one the thing already has', async () => {
    const { ctx, task } = await setup()
    const owner = { type: 'task', id: task }
    await add(ctx, owner, 'https://example.com/a')
    const b = (await add(ctx, owner, 'https://example.com/b')).json()
    const res = await ctx.app.inject({
      method: 'PATCH',
      url: `/api/v1/resources/${b.id}`,
      headers: ctx.authed,
      payload: { url: 'https://example.com/a' },
    })
    expect(res.statusCode).toBe(409)
  })
})

describe('dragging among the pinned', () => {
  const patch = (ctx: Harness, id: string, payload: object) =>
    ctx.app.inject({
      method: 'PATCH',
      url: `/api/v1/resources/${id}`,
      headers: ctx.authed,
      payload,
    })

  /** A project with a, b, c pinned as 1, 2, 3 and d not pinned, in that order. */
  async function pinned() {
    const { ctx, projectId } = await setup()
    const owner = { type: 'project', id: projectId }
    const ids: string[] = []
    for (const n of ['a', 'b', 'c', 'd']) {
      ids.push((await add(ctx, owner, `https://example.com/${n}`, n)).json().id)
    }
    for (const [at, id] of ids.slice(0, 3).entries()) {
      expect((await patch(ctx, id, { pinnedRank: at + 1 })).statusCode).toBe(200)
    }
    const keys = async () =>
      Object.fromEntries(
        (await listed(ctx, 'project', projectId)).map((r) => [r.name, r.pinnedRank]),
      )
    const order = async () => (await listed(ctx, 'project', projectId)).map((r) => r.name)
    return { ctx, ids: ids as [string, string, string, string], keys, order }
  }

  it('gives the number keys out again in the new order, in the same step', async () => {
    const { ctx, ids, keys, order } = await pinned()
    const res = await patch(ctx, ids[2], { beforeId: ids[0] })
    expect(res.statusCode, res.body).toBe(200)
    // The answer is the one that moved, with its new key.
    expect(res.json()).toMatchObject({ name: 'c', pinnedRank: 1 })
    expect(await order()).toEqual(['c', 'a', 'b', 'd'])
    expect(await keys()).toEqual({ c: 1, a: 2, b: 3, d: null })
  })

  it('swaps the keys of two neighbours dragged past each other', async () => {
    const { ctx, ids, keys } = await pinned()
    await patch(ctx, ids[0], { afterId: ids[1] })
    expect(await keys()).toEqual({ b: 1, a: 2, c: 3, d: null })
  })

  it('leaves the keys alone when the pinned ones keep their order', async () => {
    const { ctx, ids, keys, order } = await pinned()
    // The unpinned one dragged in among them.
    await patch(ctx, ids[3], { beforeId: ids[1] })
    expect(await order()).toEqual(['a', 'd', 'b', 'c'])
    expect(await keys()).toEqual({ a: 1, d: null, b: 2, c: 3 })
  })

  it('does not tidy keys that were never in the order they stand in, unless the order changes', async () => {
    const { ctx, ids, keys } = await pinned()
    // a, b, c stand in that order but c is 1 and a is 3, by hand.
    await patch(ctx, ids[0], { pinnedRank: null })
    await patch(ctx, ids[2], { pinnedRank: 1 })
    await patch(ctx, ids[0], { pinnedRank: 3 })
    expect(await keys()).toEqual({ a: 3, b: 2, c: 1, d: null })
    await patch(ctx, ids[3], { beforeId: ids[0] })
    expect(await keys()).toEqual({ a: 3, b: 2, c: 1, d: null })
    // But dragging a pinned one past another does give them out in the new order.
    await patch(ctx, ids[2], { beforeId: ids[0] })
    expect(await keys()).toEqual({ c: 1, d: null, a: 2, b: 3 })
  })

  it("is the person's own when the same patch gives a number", async () => {
    const { ctx, ids, keys, order } = await pinned()
    // Pinned as 4 and put first in one step: its number is what was asked, the others stay.
    const res = await patch(ctx, ids[3], { beforeId: ids[0], pinnedRank: 4 })
    expect(res.statusCode, res.body).toBe(200)
    expect(await order()).toEqual(['d', 'a', 'b', 'c'])
    expect(await keys()).toEqual({ d: 4, a: 1, b: 2, c: 3 })
  })

  it('does not touch the resources of anything but a project', async () => {
    const { ctx, task } = await setup()
    const owner = { type: 'task', id: task }
    const a = (await add(ctx, owner, 'https://example.com/a')).json()
    const b = (await add(ctx, owner, 'https://example.com/b')).json()
    const res = await patch(ctx, b.id, { beforeId: a.id })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toMatchObject({ pinnedRank: null })
  })
})
