import type { ResourceResponse } from '@ctws/contracts'
import { afterEach, describe, expect, it } from 'vitest'
import { createProject, createTask } from '../helpers/builders'
import { appWithUser, eventsOf, type Harness, secondUser } from '../helpers/harness'

/**
 * RESOURCES (FR-046, FR-053): an outside address on any thing, with an optional name; a project
 * pins up to nine of its own in its head, one per digit key.
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
})
