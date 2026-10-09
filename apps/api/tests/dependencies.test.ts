import type { DependencyRef } from '@ctws/contracts'
import { afterEach, describe, expect, it } from 'vitest'
import {
  appWithUser,
  createProject,
  createTask,
  setupWith,
  type TaskCtx,
  web,
} from './helpers/tasks'

/**
 * 「A 没做完 B 做不了」 (D64).
 *
 * The edge is stored; "blocked" is derived. These are about keeping the edges honest -- loops
 * refused, tenants separated, both directions readable -- and about the one property the whole
 * feature rests on: finishing the blocker unblocks the other one with NO second write.
 */

const cleanups: (() => Promise<void>)[] = []

const setup = () => setupWith(cleanups)
afterEach(async () => {
  for (const stop of cleanups.splice(0)) await stop()
})

const dependOn = (ctx: TaskCtx, waits: string, on: string) =>
  ctx.app.inject({
    method: 'POST',
    url: `/api/v1/tasks/${waits}/dependencies`,
    headers: web(ctx),
    payload: { blockerId: on },
  })

const undepend = (ctx: TaskCtx, waits: string, on: string) =>
  ctx.app.inject({
    method: 'DELETE',
    url: `/api/v1/tasks/${waits}/dependencies/${on}`,
    headers: web(ctx),
  })

async function lists(ctx: TaskCtx, id: string) {
  const res = await ctx.app.inject({
    method: 'GET',
    url: `/api/v1/tasks/${id}/dependencies`,
    headers: ctx.authed,
  })
  expect(res.statusCode).toBe(200)
  return res.json() as { blockedBy: DependencyRef[]; blocks: DependencyRef[] }
}

const setStatus = (ctx: TaskCtx, id: string, status: string) =>
  ctx.app.inject({
    method: 'PATCH',
    url: `/api/v1/tasks/${id}`,
    headers: web(ctx),
    payload: { status },
  })

async function blockersOnToday(ctx: TaskCtx) {
  const res = await ctx.app.inject({
    method: 'GET',
    url: '/api/v1/tasks/today',
    headers: ctx.authed,
  })
  return (res.json() as { tasks: { title: string; blockedBy: DependencyRef[] }[] }).tasks
}

describe('task dependencies', () => {
  it('records both directions of one edge', async () => {
    const ctx = await setup()
    const pid = await createProject(ctx, '改版')
    const ci = await createTask(ctx, pid, '跑通 CI')
    const ship = await createTask(ctx, pid, '发 v0.8.0')

    expect((await dependOn(ctx, ship, ci)).statusCode).toBe(204)
    expect((await lists(ctx, ship)).blockedBy.map((r) => r.title)).toEqual(['跑通 CI'])
    expect((await lists(ctx, ci)).blocks.map((r) => r.title)).toEqual(['发 v0.8.0'])
  })

  it('crosses projects, and says which project the other end is in', async () => {
    // 「等 rrgen 的 CI 跑通才能发 CTWS 的 release」. The two graphs -- parent tree and dependency
    // -- have no containment relationship, so there is nothing to forbid here.
    const ctx = await setup()
    const ctws = await createProject(ctx, 'CTWS')
    const rrgen = await createProject(ctx, 'rrgen')
    const ci = await createTask(ctx, rrgen, '跑通 CI')
    const ship = await createTask(ctx, ctws, '发 v0.8.0')
    expect((await dependOn(ctx, ship, ci)).statusCode).toBe(204)

    const [ref] = (await lists(ctx, ship)).blockedBy
    expect(ref).toMatchObject({ title: '跑通 CI', projectName: 'rrgen' })
  })

  it('unblocks when the blocker is finished, with no second write', async () => {
    // THE PROPERTY THE WHOLE FEATURE RESTS ON. Nothing stores "blocked"; it is read off the
    // blocker's status, so the two can never drift apart.
    const ctx = await setup()
    const pid = await createProject(ctx, '改版')
    const ci = await createTask(ctx, pid, '跑通 CI')
    const ship = await createTask(ctx, pid, '发 v0.8.0')
    await dependOn(ctx, ship, ci)
    await setStatus(ctx, ship, 'in_progress')

    const blocked = (await blockersOnToday(ctx)).find((t) => t.title === '发 v0.8.0')!
    expect(blocked.blockedBy.map((r) => r.title)).toEqual(['跑通 CI'])

    await setStatus(ctx, ci, 'done')
    const free = (await blockersOnToday(ctx)).find((t) => t.title === '发 v0.8.0')!
    expect(free.blockedBy).toEqual([])
    // The edge itself is still there -- it is a fact about the work, not about the moment.
    expect((await lists(ctx, ship)).blockedBy.map((r) => r.done)).toEqual([true])
  })

  it('refuses a loop, however long', async () => {
    const ctx = await setup()
    const pid = await createProject(ctx, '改版')
    const a = await createTask(ctx, pid, 'A')
    const b = await createTask(ctx, pid, 'B')
    const c = await createTask(ctx, pid, 'C')
    await dependOn(ctx, b, a) // B waits for A
    await dependOn(ctx, c, b) // C waits for B

    // A waiting for C would close A -> B -> C -> A.
    const res = await dependOn(ctx, a, c)
    expect(res.statusCode).toBe(409)
    expect((await lists(ctx, a)).blockedBy).toEqual([])
  })

  it('refuses the shortest loop of all', async () => {
    const ctx = await setup()
    const pid = await createProject(ctx, '改版')
    const a = await createTask(ctx, pid, 'A')
    expect((await dependOn(ctx, a, a)).statusCode).toBe(409)
  })

  it('allows a diamond, which is not a loop', async () => {
    // D waits for B and C, both of which wait for A. A naive cycle walk that re-visits a node
    // once per path would also be the one that explodes here.
    const ctx = await setup()
    const pid = await createProject(ctx, '改版')
    const a = await createTask(ctx, pid, 'A')
    const b = await createTask(ctx, pid, 'B')
    const c = await createTask(ctx, pid, 'C')
    const d = await createTask(ctx, pid, 'D')
    await dependOn(ctx, b, a)
    await dependOn(ctx, c, a)
    await dependOn(ctx, d, b)
    expect((await dependOn(ctx, d, c)).statusCode).toBe(204)
    expect((await lists(ctx, d)).blockedBy.map((r) => r.title).sort()).toEqual(['B', 'C'])
  })

  it('is idempotent in both directions', async () => {
    const ctx = await setup()
    const pid = await createProject(ctx, '改版')
    const a = await createTask(ctx, pid, 'A')
    const b = await createTask(ctx, pid, 'B')
    expect((await dependOn(ctx, b, a)).statusCode).toBe(204)
    expect((await dependOn(ctx, b, a)).statusCode).toBe(204)
    expect((await lists(ctx, b)).blockedBy).toHaveLength(1)

    expect((await undepend(ctx, b, a)).statusCode).toBe(204)
    expect((await undepend(ctx, b, a)).statusCode).toBe(204)
    expect((await lists(ctx, b)).blockedBy).toEqual([])
  })

  it('leaves a deleted task out of what is in the way', async () => {
    const ctx = await setup()
    const pid = await createProject(ctx, '改版')
    const ci = await createTask(ctx, pid, '跑通 CI')
    const ship = await createTask(ctx, pid, '发 v0.8.0')
    await dependOn(ctx, ship, ci)
    await setStatus(ctx, ship, 'in_progress')
    await ctx.app.inject({ method: 'DELETE', url: `/api/v1/tasks/${ci}`, headers: web(ctx) })

    // Soft-deleted: the row survives and the edge with it, but a task nobody can see cannot be
    // what someone is waiting for. BOTH READ PATHS -- the detail lists and the one the ROWS use,
    // which are different queries and were not both covered until a mutation said so.
    expect((await lists(ctx, ship)).blockedBy).toEqual([])
    const row = (await blockersOnToday(ctx)).find((t) => t.title === '发 v0.8.0')!
    expect(row.blockedBy).toEqual([])
  })

  it('refuses an id from another workspace as a not-found, not as a refusal', async () => {
    const ctx = await setup()
    const pid = await createProject(ctx, '改版')
    const mine = await createTask(ctx, pid, '我的')

    const other = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      headers: { 'x-ctws-client': 'web' },
      payload: { email: 'other@example.com', password: 'correct horse battery', timezone: 'UTC' },
    })
    const theirs: TaskCtx = {
      ...ctx,
      authed: {
        'x-ctws-client': 'web',
        cookie: String(other.headers['set-cookie']).split(';')[0]!,
      },
    }
    const theirPid = await createProject(theirs, '别人的')
    const theirTask = await createTask(theirs, theirPid, '别人的任务')

    // 404 and not 409: a refusal that distinguished "exists but is not yours" would confirm the
    // id exists.
    expect((await dependOn(ctx, mine, theirTask)).statusCode).toBe(404)
    expect((await dependOn(ctx, theirTask, mine)).statusCode).toBe(404)
    expect((await lists(ctx, mine)).blockedBy).toEqual([])
  })

  it('writes the arrival and the departure into the task history', async () => {
    const ctx = await setup()
    const pid = await createProject(ctx, '改版')
    const a = await createTask(ctx, pid, 'A')
    const b = await createTask(ctx, pid, 'B')
    await dependOn(ctx, b, a)
    await undepend(ctx, b, a)

    const res = await ctx.app.inject({
      method: 'GET',
      url: `/api/v1/tasks/${b}/events`,
      headers: ctx.authed,
    })
    const types = (res.json() as { events: { type: string }[] }).events.map((e) => e.type)
    // On the WAITING task: it is the one whose situation changed, and its history is where
    // someone looks to ask why it sat still.
    expect(types).toContain('dependency_added')
    expect(types).toContain('dependency_removed')
  })

  it('reports what is in the way on the project list too', async () => {
    const ctx = await setup()
    const pid = await createProject(ctx, '改版')
    const ci = await createTask(ctx, pid, '跑通 CI')
    const ship = await createTask(ctx, pid, '发 v0.8.0')
    await dependOn(ctx, ship, ci)

    const res = await ctx.app.inject({
      method: 'GET',
      url: `/api/v1/tasks?projectId=${pid}`,
      headers: ctx.authed,
    })
    const body = res.json() as { blockers: Record<string, DependencyRef[]> }
    expect(body.blockers[ship]!.map((r) => r.title)).toEqual(['跑通 CI'])
    // A task with nothing in its way is absent rather than present-and-empty.
    expect(body.blockers[ci]).toBeUndefined()
  })
})
