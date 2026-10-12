import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { appWithUser, createProject, createTask, type TaskCtx } from './helpers/tasks'

/**
 * The API half of the module seam: the task module answers under `/api/v1/tasks/`, the shell's own
 * surfaces stay flat, the paths the module used to occupy still answer by redirect, and moving
 * `projects` into the shell did not take the tenant chokepoint with it.
 *
 * None of these assertions can pass against the pre-seam code: there was no `/api/v1/tasks/today`
 * and `/api/v1/today` was a 200, not a redirect.
 */
let ctx: TaskCtx
let projectId: string
let otherAuthed: Record<string, string>

beforeAll(async () => {
  ctx = await appWithUser('seam@example.com')
  projectId = await createProject(ctx, 'Seam')
  await createTask(ctx, projectId, 'inside')
  // A SECOND user on the SAME app and database: two `appWithUser()` calls would be two unrelated
  // databases and any isolation assertion between them would pass trivially.
  const res = await ctx.app.inject({
    method: 'POST',
    url: '/api/v1/auth/register',
    headers: { 'x-ctws-client': 'web' },
    payload: { email: 'intruder@example.com', password: 'correct horse battery', timezone: 'UTC' },
  })
  expect(res.statusCode).toBe(201)
  otherAuthed = {
    'x-ctws-client': 'web',
    cookie: String(res.headers['set-cookie']).split(';')[0]!,
  }
}, 180_000)

afterAll(async () => {
  await ctx?.stop()
})

const get = (url: string, headers = ctx.authed) => ctx.app.inject({ method: 'GET', url, headers })

describe('the task module answers under its own namespace', () => {
  it('serves today, completed, search and the task collection under /api/v1/tasks', async () => {
    expect((await get('/api/v1/tasks/today')).statusCode).toBe(200)
    expect((await get('/api/v1/tasks/completed')).statusCode).toBe(200)
    expect((await get('/api/v1/tasks/search?q=inside')).statusCode).toBe(200)
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

describe('the paths the module used to occupy still answer', () => {
  // A deployed app: a bookmark, or a tab still running the previous bundle, must not meet a 404
  // because the code was reorganised. 308 preserves the method and the body.
  it.each([
    ['/api/v1/today', '/api/v1/tasks/today'],
    ['/api/v1/completed', '/api/v1/tasks/completed'],
  ])('redirects %s to %s', async (from, to) => {
    const res = await get(from)
    expect(res.statusCode).toBe(308)
    expect(res.headers.location).toBe(to)
  })

  it('carries the querystring through the search redirect', async () => {
    const res = await get('/api/v1/search?q=in%20side')
    expect(res.statusCode).toBe(308)
    expect(res.headers.location).toBe('/api/v1/tasks/search?q=in%20side')
  })

  it('redirects the old project-tasks path onto the module collection', async () => {
    const res = await get(`/api/v1/projects/${projectId}/tasks`)
    expect(res.statusCode).toBe(308)
    expect(res.headers.location).toBe(`/api/v1/tasks?projectId=${projectId}`)
  })

  it('still 404s a path that never existed', async () => {
    expect((await get('/api/v1/notes/today')).statusCode).toBe(404)
  })
})

describe('the OpenAPI document describes the namespaced API', () => {
  it('documents the module paths and not the redirects', async () => {
    const doc = (await get('/api/v1/openapi.json')).json() as { paths: Record<string, unknown> }
    const paths = Object.keys(doc.paths)
    expect(paths).toContain('/api/v1/tasks/today')
    expect(paths).toContain('/api/v1/tasks/search')
    // The shell's own surface, still flat.
    expect(paths).toContain('/api/v1/projects')
    // The compatibility redirects are hidden: the document describes the API as it is now, and
    // listing every endpoint twice would make the namespace look optional.
    expect(paths).not.toContain('/api/v1/today')
    expect(paths).not.toContain('/api/v1/completed')
    expect(paths).not.toContain('/api/v1/projects/{id}/tasks')
  })
})

describe('the tenant chokepoint survived the move into the shell', () => {
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
