import type { RollupResponse } from '@ctws/contracts'
import { sql } from 'drizzle-orm'
import { afterEach, describe, expect, it } from 'vitest'
import { BOARD_TX, listProjectTasks } from '../src/modules/tasks/queries/list'
import { projectRollups } from '../src/modules/tasks/queries/rollup'
import { appWithUser, createProject, createTask, type TaskCtx } from './helpers/tasks'

/**
 * THE HALF OF THE ROLLUP THAT IS NOT IN `@ctws/core`.
 *
 * The fold is covered case by case in `packages/core/src/progress.test.ts`. What only the real
 * database can answer is the part written in SQL: the two deadline flags, decided in the ACCOUNT's
 * timezone, and the per-task last-activity max joined from the event log.
 */

const cleanups: (() => Promise<void>)[] = []
afterEach(async () => {
  for (const stop of cleanups.splice(0)) await stop()
})

async function setup(timezone?: string): Promise<TaskCtx> {
  const ctx = await appWithUser()
  cleanups.push(ctx.stop)
  if (timezone) await ctx.db.execute(sql`update users set timezone = ${timezone}`)
  return ctx
}

async function rollups(ctx: TaskCtx, projectId: string): Promise<Record<string, RollupResponse>> {
  const res = await ctx.app.inject({
    method: 'GET',
    url: `/api/v1/tasks?projectId=${projectId}`,
    headers: ctx.authed,
  })
  expect(res.statusCode).toBe(200)
  return res.json().rollups as Record<string, RollupResponse>
}

const setStatus = (ctx: TaskCtx, id: string, status: string) =>
  ctx.app.inject({
    method: 'PATCH',
    url: `/api/v1/tasks/${id}`,
    headers: { ...ctx.authed, 'x-ctws-client': 'web' },
    payload: { status },
  })

const setDue = (ctx: TaskCtx, id: string, dueAt: string | null) =>
  ctx.app.inject({
    method: 'PATCH',
    url: `/api/v1/tasks/${id}`,
    headers: { ...ctx.authed, 'x-ctws-client': 'web' },
    payload: { dueAt },
  })

describe('rollups ride along with the task list', () => {
  it('returns one entry per task, keyed by id', async () => {
    const ctx = await setup()
    const pid = await createProject(ctx, 'P')
    const a = await createTask(ctx, pid, '父')
    const b = await createTask(ctx, pid, '子', a)

    const r = await rollups(ctx, pid)
    expect(Object.keys(r).sort()).toEqual([a, b].sort())
  })

  it('is an empty object for a project with no tasks, not an error', async () => {
    const ctx = await setup()
    const pid = await createProject(ctx, 'P')
    expect(await rollups(ctx, pid)).toEqual({})
  })

  it('404s for a project in another workspace rather than returning nothing', async () => {
    // The 404 is `listProjectTasks`', which the route calls first; the rollup query is scoped in
    // its own `where` and would simply find nothing. Both halves matter, so this asserts the
    // behaviour the endpoint actually has.
    const mine = await setup()
    const theirs = await appWithUser('other@example.com')
    cleanups.push(theirs.stop)
    const pid = await createProject(theirs, 'theirs')

    const res = await mine.app.inject({
      method: 'GET',
      url: `/api/v1/tasks?projectId=${pid}`,
      headers: mine.authed,
    })
    expect(res.statusCode).toBe(404)
  })

  it('folds a real tree the way the pure function does', async () => {
    const ctx = await setup()
    const pid = await createProject(ctx, 'P')
    const root = await createTask(ctx, pid, '根')
    const x = await createTask(ctx, pid, 'x', root)
    const y = await createTask(ctx, pid, 'y', root)
    const y1 = await createTask(ctx, pid, 'y1', y)
    await createTask(ctx, pid, 'y2', y)
    await setStatus(ctx, x, 'done')
    await setStatus(ctx, y1, 'done')

    const r = await rollups(ctx, pid)
    // y is (1 + 0) / 2 = 0.5, and the root is (1 + 0.5) / 2 = 0.75: the mean is over DIRECT
    // children at every level, so the root is not 2/3 (the done-leaf fraction).
    expect(r[y]!.progress).toBe(0.5)
    expect(r[root]!.progress).toBe(0.75)
  })

  it('counts the whole subtree, including the node itself', async () => {
    const ctx = await setup()
    const pid = await createProject(ctx, 'P')
    const root = await createTask(ctx, pid, '根')
    const kid = await createTask(ctx, pid, '子', root)
    await setStatus(ctx, kid, 'done')

    const r = await rollups(ctx, pid)
    expect(r[root]!.counts).toEqual({
      backlog: 0,
      todo: 1,
      in_progress: 0,
      done: 1,
      cancelled: 0,
    })
  })

  it('leaves a soft-deleted task out of its parent entirely', async () => {
    const ctx = await setup()
    const pid = await createProject(ctx, 'P')
    const root = await createTask(ctx, pid, '根')
    const gone = await createTask(ctx, pid, '删掉的', root)
    await setStatus(ctx, gone, 'done')
    await ctx.app.inject({
      method: 'DELETE',
      url: `/api/v1/tasks/${gone}`,
      headers: { ...ctx.authed, 'x-ctws-client': 'web' },
    })

    const r = await rollups(ctx, pid)
    expect(r[gone]).toBeUndefined()
    // The root is a leaf again, so it falls back to its own status rather than keeping the 1 the
    // deleted child used to give it.
    expect(r[root]!.counts.done).toBe(0)
    expect(r[root]!.progress).toBe(0)
  })
})

describe('the exclusion rule on a tree built the normal way', () => {
  it('reports progress for a freshly built tree, with nobody setting a status first', async () => {
    const ctx = await setup()
    const pid = await createProject(ctx, '改版')
    const root = await createTask(ctx, pid, '根')
    const kid = await createTask(ctx, pid, '子', root)
    await setStatus(ctx, kid, 'done')

    // WHY THE DEFAULT IS `todo`. The fold excludes a `backlog` node before it looks at its
    // children, so a backlog default makes this read null however much is finished underneath --
    // for every tree, everywhere.
    expect((await rollups(ctx, pid))[root]!.progress).toBe(1)
  })

  it('still excludes a parent somebody deliberately filed as backlog', async () => {
    const ctx = await setup()
    const pid = await createProject(ctx, '改版')
    const root = await createTask(ctx, pid, '以后再说')
    const kid = await createTask(ctx, pid, '子', root)
    await setStatus(ctx, kid, 'done')
    await setStatus(ctx, root, 'backlog')

    // The rule itself did not change: something only recorded, not committed to, is not work in
    // flight and must not pull an average around.
    expect((await rollups(ctx, pid))[root]!.progress).toBeNull()
    // The counts still see everything -- exclusion is about averaging, not about existing.
    expect((await rollups(ctx, pid))[root]!.counts).toMatchObject({ backlog: 1, done: 1 })
  })
})

describe('the two deadline flags, decided in the account timezone', () => {
  // UTC+14. Noon UTC is already the next calendar day here, which is what makes the two windows
  // below differ from the ones a server reading its own clock would build.
  const TZ = 'Pacific/Kiritimati'
  const dayOffset = (days: number) => {
    const d = new Date()
    d.setUTCDate(d.getUTCDate() + days)
    return d.toISOString()
  }

  it('counts a past deadline as overdue and not as due soon', async () => {
    const ctx = await setup(TZ)
    const pid = await createProject(ctx, 'P')
    const root = await createTask(ctx, pid, '根')
    const late = await createTask(ctx, pid, '逾期的', root)
    await setDue(ctx, late, dayOffset(-3))

    const r = await rollups(ctx, pid)
    expect(r[late]).toMatchObject({ overdue: 1, dueSoon: 0 })
    expect(r[root]).toMatchObject({ overdue: 1, dueSoon: 0 })
  })

  it('counts tomorrow as due soon and the day after as neither', async () => {
    const ctx = await setup(TZ)
    const pid = await createProject(ctx, 'P')
    const root = await createTask(ctx, pid, '根')
    const soon = await createTask(ctx, pid, '快到期', root)
    const later = await createTask(ctx, pid, '还早', root)
    await setDue(ctx, soon, dayOffset(1))
    await setDue(ctx, later, dayOffset(5))

    const r = await rollups(ctx, pid)
    expect(r[soon]).toMatchObject({ overdue: 0, dueSoon: 1 })
    expect(r[later]).toMatchObject({ overdue: 0, dueSoon: 0 })
    expect(r[root]).toMatchObject({ overdue: 0, dueSoon: 1 })
  })

  it('stops counting a passed deadline once the task is finished', async () => {
    const ctx = await setup(TZ)
    const pid = await createProject(ctx, 'P')
    const done = await createTask(ctx, pid, '做完了但逾期')
    await setDue(ctx, done, dayOffset(-3))
    expect((await rollups(ctx, pid))[done]).toMatchObject({ overdue: 1 })

    await setStatus(ctx, done, 'done')
    // A deadline that has passed on something already finished is not a problem to report.
    expect((await rollups(ctx, pid))[done]).toMatchObject({ overdue: 0, dueSoon: 0 })
  })

  it('stops counting a COMING deadline once the task is finished', async () => {
    // The same guard, on the other flag: the due-soon branch needs its own case, or it can lose
    // the status check while the overdue case above stays green.
    const ctx = await setup(TZ)
    const pid = await createProject(ctx, 'P')
    const done = await createTask(ctx, pid, '提前做完了')
    await setDue(ctx, done, dayOffset(1))
    expect((await rollups(ctx, pid))[done]).toMatchObject({ dueSoon: 1 })

    await setStatus(ctx, done, 'done')
    expect((await rollups(ctx, pid))[done]).toMatchObject({ overdue: 0, dueSoon: 0 })
  })

  it('does not call a deadline that passed EARLIER TODAY overdue', async () => {
    // THE CUT IS THE START OF TODAY, not `now()`. A deadline at 09:00 that it is now 14:00 past
    // has not "gone" in the sense this app means -- the day it was due is the day in progress,
    // and the Overdue panel would otherwise fill up with things the person is still working on.
    const ctx = await setup(TZ)
    const pid = await createProject(ctx, 'P')
    const id = await createTask(ctx, pid, '今天早些时候到期')

    // Strictly between the start of the account's day and now, whenever this runs.
    const now = Date.now()
    const local = new Date(new Date().toLocaleString('en-US', { timeZone: TZ }))
    const sinceDayStart =
      local.getHours() * 3600_000 + local.getMinutes() * 60_000 + local.getSeconds() * 1000
    const midday = new Date(now - sinceDayStart / 2)
    await setDue(ctx, id, midday.toISOString())

    expect((await rollups(ctx, pid))[id]).toMatchObject({ overdue: 0, dueSoon: 1 })
  })

  it('agrees with the today view about which tasks are overdue', async () => {
    // The project banner and the Overdue panel must not disagree about the same task, which is why
    // both cut at the start of today in the account's zone rather than at `now()`.
    const ctx = await setup(TZ)
    const pid = await createProject(ctx, 'P')
    const late = await createTask(ctx, pid, '逾期的')
    await setDue(ctx, late, dayOffset(-3))

    const todayRes = await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/tasks/today',
      headers: ctx.authed,
    })
    const segments = (todayRes.json().tasks as { id: string; segment: string }[]).filter(
      (t) => t.segment === 'overdue',
    )
    expect(segments.map((t) => t.id)).toEqual([late])
    expect((await rollups(ctx, pid))[late]).toMatchObject({ overdue: 1 })
  })
})

describe('last activity comes from the event log', () => {
  it('is the most recent change anywhere in the subtree', async () => {
    const ctx = await setup()
    const pid = await createProject(ctx, 'P')
    const root = await createTask(ctx, pid, '根')
    const kid = await createTask(ctx, pid, '子', root)

    // Backdate every event, then give the CHILD one recent event: the parent must report the
    // child's, since the point of the metric is that a whole branch has gone quiet.
    await ctx.db.execute(sql`update task_events set occurred_at = now() - interval '30 days'`)
    await setStatus(ctx, kid, 'in_progress')

    const r = await rollups(ctx, pid)
    expect(r[root]!.lastActivityAt).toBe(r[kid]!.lastActivityAt)
    const age = Date.now() - Date.parse(r[root]!.lastActivityAt!)
    expect(age).toBeLessThan(60_000)
  })

  it('reports each node its own subtree, not the project as a whole', async () => {
    const ctx = await setup()
    const pid = await createProject(ctx, 'P')
    const quiet = await createTask(ctx, pid, '放着的')
    const busy = await createTask(ctx, pid, '在动的')
    await ctx.db.execute(sql`update task_events set occurred_at = now() - interval '30 days'`)
    await setStatus(ctx, busy, 'in_progress')

    const r = await rollups(ctx, pid)
    expect(Date.parse(r[busy]!.lastActivityAt!)).toBeGreaterThan(
      Date.parse(r[quiet]!.lastActivityAt!),
    )
  })

  it('is a fixed-width UTC instant, which is what makes the max a max', async () => {
    const ctx = await setup()
    const pid = await createProject(ctx, 'P')
    const id = await createTask(ctx, pid, '一条')
    const r = await rollups(ctx, pid)
    expect(r[id]!.lastActivityAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/)
  })
})

/**
 * THE PAGE MUST NOT CONTRADICT ITSELF.
 *
 * A project page is three reads: the rows, the rollup each parent reports, and what each row is
 * waiting for. Run under READ COMMITTED they each take their OWN snapshot, so a write landing
 * between two of them is half-visible: the tree draws a task as open while the number above it
 * already counts it done, and the reader is looking at a page that disagrees with itself.
 *
 * `projectBoard` holds one snapshot across the three by naming the level in `BOARD_TX`. This runs
 * the same three stores through the same kind of transaction and commits a write IN THE MIDDLE,
 * from another connection -- which is the only arrangement where the two levels differ. Change
 * `BOARD_TX` back to the default and this test says the rollup reported 1 against a tree that
 * shows the task open.
 */
describe('one project page is one snapshot', () => {
  it('does not straddle a write that lands between its reads', async () => {
    const ctx = await setup()
    const pid = await createProject(ctx, 'P')
    const parent = await createTask(ctx, pid, 'parent')
    const child = await createTask(ctx, pid, 'child', parent)
    const { workspaceId } = (
      await ctx.app.inject({ method: 'GET', url: '/api/v1/auth/me', headers: ctx.authed })
    ).json() as { workspaceId: string }

    await ctx.db.transaction(async (tx) => {
      const tasks = await listProjectTasks(tx, workspaceId, pid)
      // Committed by the API, on the pool: a write on `tx` itself would be invisible to it
      // whatever the level, and would prove nothing.
      expect((await setStatus(ctx, child, 'done')).statusCode).toBe(200)
      const rolled = await projectRollups(tx, workspaceId, pid, 'UTC', new Date())

      expect(tasks.find((t) => t.id === child)!.status).toBe('todo')
      expect(rolled.get(parent)!.progress).toBe(0)
    }, BOARD_TX)

    // ...and the write really did land, so this is not passing because nothing happened.
    expect((await rollups(ctx, pid))[parent]!.progress).toBe(1)
  })
})
