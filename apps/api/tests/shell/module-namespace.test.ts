import type { ProjectId } from '@ctws/contracts'
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { appWithUser, type Harness, secondUser } from '../helpers/harness'
import { createProject, createTask } from '../helpers/builders'

/**
 * The task module answers under `/api/v1/tasks/`, the shell's own surfaces stay flat, and the
 * project tenant check holds on every project route.
 */
let ctx: Harness
let projectId: ProjectId
let otherAuthed: Record<string, string>

beforeAll(async () => {
  ctx = await appWithUser('seam@example.com')
  projectId = await createProject(ctx, 'Seam')
  await createTask(ctx, projectId, 'inside')
  // A SECOND user on the SAME app and database: two `appWithUser()` calls would be two unrelated
  // databases and any isolation assertion between them would pass trivially.
  otherAuthed = (await secondUser(ctx, 'intruder@example.com')).authed
}, 180_000)

afterAll(async () => {
  await ctx?.stop()
})

const get = (url: string, headers = ctx.authed) => ctx.app.inject({ method: 'GET', url, headers })

describe('the task module answers under its own namespace', () => {
  it('serves today, completed, search and the task collection under /api/v1/tasks', async () => {
    expect((await get('/api/v1/tasks?view=today')).statusCode).toBe(200)
    expect((await get('/api/v1/tasks?view=completed')).statusCode).toBe(200)
    expect((await get('/api/v1/tasks?q=inside')).statusCode).toBe(200)
    const list = await get(`/api/v1/tasks?projectId=${projectId}`)
    expect(list.statusCode).toBe(200)
    expect((list.json().tasks as unknown[]).length).toBe(1)
  })

  it('keeps the shell surfaces flat, outside the module namespace', async () => {
    expect((await get('/api/v1/projects')).statusCode).toBe(200)
    expect((await get('/api/v1/auth/me')).statusCode).toBe(200)
    expect((await get('/api/v1/health')).statusCode).toBe(200)
  })
})

describe('the OpenAPI document describes the namespaced API', () => {
  it('documents the module paths', async () => {
    const doc = (await get('/api/v1/openapi.json')).json() as { paths: Record<string, unknown> }
    const paths = Object.keys(doc.paths)
    expect(paths).toContain('/api/v1/tasks')
    expect(paths).toContain('/api/v1/tasks/{id}')
    // A view of a collection is a query on its path, not a path of its own; `/search` is the
    // shell's, across every collection, and no collection's view.
    expect(
      paths.filter((p) => /\/v1\/.+\/(today|search|calendar|completed|movement)$/.test(p)),
    ).toEqual([])
    expect(paths).toContain('/api/v1/search')
    // The shell's own surface, still flat.
    expect(paths).toContain('/api/v1/projects')
  })
})

describe('the tenant chokepoint on the shell', () => {
  it('refuses every project surface to another workspace', async () => {
    // The intruder's own list must not contain our project...
    const theirs = (await get('/api/v1/projects', otherAuthed)).json().projects as {
      id: string
    }[]
    expect(theirs.some((p) => p.id === projectId)).toBe(false)
    // ...and naming it directly is a 404, not a 403: ids must not be probeable.
    const patch = await ctx.app.inject({
      method: 'PATCH',
      url: `/api/v1/projects/${projectId}`,
      headers: otherAuthed,
      payload: { name: 'theirs now' },
    })
    expect(patch.statusCode).toBe(404)
    const del = await ctx.app.inject({
      method: 'DELETE',
      url: `/api/v1/projects/${projectId}`,
      headers: otherAuthed,
    })
    expect(del.statusCode).toBe(404)
    // The project is untouched.
    expect((await get(`/api/v1/projects`)).json().projects[0].name).not.toBe('theirs now')
  })

  it('refuses the module read that reaches a workspace THROUGH the project', async () => {
    // `tasks` carries no workspace id; it borrows the shell's predicate by join. If the module
    // kept its own copy and that copy drifted, this is the assertion that would fail.
    expect((await get(`/api/v1/tasks?projectId=${projectId}`, otherAuthed)).statusCode).toBe(404)
    const mine = await get(`/api/v1/tasks?projectId=${projectId}`)
    expect(mine.statusCode).toBe(200)
    expect((mine.json().tasks as unknown[]).length).toBe(1)
  })

  it('leaks nothing about a project id that exists in no workspace at all', async () => {
    expect((await get(`/api/v1/tasks?projectId=${randomUUID()}`)).statusCode).toBe(404)
  })
})
