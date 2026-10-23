import type { DependencyRef } from '@ctws/contracts'
import { sql } from 'drizzle-orm'
import { afterEach, describe, expect, it } from 'vitest'
import {
  eventsOf,
  expectBlockedByTreeLock,
  setupWith,
  type Harness,
  web,
  secondUser,
} from '../../helpers/harness'
import { createProject, createTask } from '../../helpers/builders'

/**
 * ONE TASK WAITING FOR ANOTHER.
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

const dependOn = (ctx: Harness, waits: string, on: string) =>
  ctx.app.inject({
    method: 'PUT',
    url: `/api/v1/tasks/${waits}/dependencies/${on}`,
    headers: web(ctx),
  })

const undepend = (ctx: Harness, waits: string, on: string) =>
  ctx.app.inject({
    method: 'DELETE',
    url: `/api/v1/tasks/${waits}/dependencies/${on}`,
    headers: web(ctx),
  })

async function lists(ctx: Harness, id: string) {
  const res = await ctx.app.inject({
    method: 'GET',
    url: `/api/v1/tasks/${id}/dependencies`,
    headers: ctx.authed,
  })
  expect(res.statusCode).toBe(200)
  return res.json() as { blockedBy: DependencyRef[]; blocks: DependencyRef[] }
}

const setStatus = (ctx: Harness, id: string, status: string) =>
  ctx.app.inject({
    method: 'PATCH',
    url: `/api/v1/tasks/${id}`,
    headers: web(ctx),
    payload: { status },
  })

async function blockersOnToday(ctx: Harness) {
  const res = await ctx.app.inject({
    method: 'GET',
    url: '/api/v1/tasks?view=today',
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
    // A release in one project waiting on another project's CI. The two graphs -- parent tree and dependency
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
    // A loop, said as a loop: the task tree's own depth and cycle refusals share this status.
    expect(res.json().detail).toMatch(/wait for each other/)
    expect((await lists(ctx, a)).blockedBy).toEqual([])
  })

  it('does not count a loop through a deleted task', async () => {
    const ctx = await setup()
    const pid = await createProject(ctx, '改版')
    const a = await createTask(ctx, pid, 'A')
    const b = await createTask(ctx, pid, 'B')
    const c = await createTask(ctx, pid, 'C')
    await dependOn(ctx, b, a) // B waits for A
    await dependOn(ctx, c, b) // C waits for B
    await ctx.app.inject({ method: 'DELETE', url: `/api/v1/tasks/${b}`, headers: web(ctx) })

    expect((await dependOn(ctx, a, c)).statusCode).toBe(204)
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

  it('logs a repeated add or remove once', async () => {
    const ctx = await setup()
    const pid = await createProject(ctx, '改版')
    const a = await createTask(ctx, pid, 'A')
    const b = await createTask(ctx, pid, 'B')
    await dependOn(ctx, b, a)
    await dependOn(ctx, b, a)
    await undepend(ctx, b, a)
    await undepend(ctx, b, a)

    const types = (await eventsOf(ctx, b)).map((e) => e.type)
    expect(types.filter((t) => t.startsWith('dependency_'))).toEqual([
      'dependency_added',
      'dependency_removed',
    ])
  })

  // Two opposite adds could each pass their own loop check; the tree lock serialises them.
  it('contends on the workspace-keyed tree lock', async () => {
    const ctx = await setup()
    const pid = await createProject(ctx, '改版')
    const a = await createTask(ctx, pid, 'A')
    const b = await createTask(ctx, pid, 'B')

    const res = await expectBlockedByTreeLock(ctx, () => dependOn(ctx, b, a))
    expect(res.statusCode).toBe(204)
    expect((await lists(ctx, b)).blockedBy).toHaveLength(1)
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

    const theirs = await secondUser(ctx)
    const theirPid = await createProject(theirs, '别人的')
    const theirTask = await createTask(theirs, theirPid, '别人的任务')

    // 404 and not 409: a refusal that distinguished "exists but is not yours" would confirm the
    // id exists.
    expect((await dependOn(ctx, mine, theirTask)).statusCode).toBe(404)
    expect((await dependOn(ctx, theirTask, mine)).statusCode).toBe(404)
    expect((await lists(ctx, mine)).blockedBy).toEqual([])
    const read = (id: string) =>
      ctx.app.inject({
        method: 'GET',
        url: `/api/v1/tasks/${id}/dependencies`,
        headers: ctx.authed,
      })
    // Reading follows GET /tasks/:id: someone else's task, or none at all, is not found.
    expect((await read(theirTask)).statusCode).toBe(404)
    expect((await read('99999999-9999-4999-8999-999999999999')).statusCode).toBe(404)
    // Removing follows it too: there is no edge of someone else's task to say is gone.
    expect((await undepend(ctx, theirTask, mine)).statusCode).toBe(404)
    // An edge of this workspace's task that was never there is already gone.
    expect((await undepend(ctx, mine, theirTask)).statusCode).toBe(204)
  })

  it('writes the arrival and the departure into the task history', async () => {
    const ctx = await setup()
    const pid = await createProject(ctx, '改版')
    const a = await createTask(ctx, pid, 'A')
    const b = await createTask(ctx, pid, 'B')
    await dependOn(ctx, b, a)
    await undepend(ctx, b, a)

    const types = (await eventsOf(ctx, b)).map((e) => e.type)
    // On the WAITING task: it is the one whose situation changed, and its history is where
    // someone looks to ask why it sat still.
    expect(types).toContain('dependency_added')
    expect(types).toContain('dependency_removed')
    // Named by its title, so the timeline says what it waited on (FR-045).
    const payloads = (await eventsOf(ctx, b))
      .filter((e) => e.type.startsWith('dependency_'))
      .map((e) => e.payload)
    expect(payloads).toEqual(
      expect.arrayContaining([
        { blockerId: a, title: 'A' },
        { blockerId: a, title: 'A' },
      ]),
    )
    expect(payloads).toHaveLength(2)
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

  it('records the edge and its event together or not at all', async () => {
    const ctx = await setup()
    const pid = await createProject(ctx, 'Atomic')
    const waits = await createTask(ctx, pid, 'waits')
    const first = await createTask(ctx, pid, 'first')
    // The event insert fails; the edge must not survive it.
    await ctx.db.execute(sql`
      create function refuse_dependency_event() returns trigger language plpgsql as $$
      begin
        if new.type = 'dependency_added' then raise exception 'refused for the test'; end if;
        return new;
      end $$
    `)
    await ctx.db.execute(sql`
      create trigger refuse_dependency_event before insert on events
        for each row execute function refuse_dependency_event()
    `)

    expect((await dependOn(ctx, waits, first)).statusCode).toBe(500)
    const edges = await ctx.db.execute(
      sql`select 1 from task_dependencies where blocked_id = ${waits} and blocker_id = ${first}`,
    )
    expect(edges.rows).toEqual([])
  })
})
