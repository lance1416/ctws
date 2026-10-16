import { DAY_MS, type RollupResponse, type ProjectId, type WorkspaceId } from '@ctws/contracts'
import { afterEach, describe, expect, it } from 'vitest'
import { BOARD_TX, listProjectTasks } from '../../../src/modules/tasks/queries/list'
import { projectRollups } from '../../../src/modules/tasks/queries/rollup'
import { appWithUser, type Harness } from '../../helpers/harness'
import { createProject, createTask } from '../../helpers/builders'

/**
 * THE HALF OF THE ROLLUP THAT IS NOT IN `@ctws/core`.
 *
 * The fold is covered case by case in `packages/core/src/progress.test.ts`. What only the real
 * database can answer is the part written in SQL: the overdue flag, decided in the ACCOUNT's
 * timezone.
 */

const cleanups: (() => Promise<void>)[] = []
afterEach(async () => {
  for (const stop of cleanups.splice(0)) await stop()
})

async function setup(timezone?: string, now?: Date): Promise<Harness> {
  const ctx = await appWithUser(undefined, {
    ...(timezone ? { timezone } : {}),
    ...(now ? { clock: () => now } : {}),
  })
  cleanups.push(ctx.stop)
  return ctx
}

async function rollups(
  ctx: Harness,
  projectId: ProjectId,
): Promise<Record<string, RollupResponse>> {
  const res = await ctx.app.inject({
    method: 'GET',
    url: `/api/v1/tasks?projectId=${projectId}`,
    headers: ctx.authed,
  })
  expect(res.statusCode).toBe(200)
  return res.json().rollups as Record<string, RollupResponse>
}

const setStatus = (ctx: Harness, id: string, status: string) =>
  ctx.app.inject({
    method: 'PATCH',
    url: `/api/v1/tasks/${id}`,
    headers: { ...ctx.authed, 'x-ctws-client': 'web' },
    payload: { status },
  })

const setDue = (ctx: Harness, id: string, dueAt: string | null) =>
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

  it('counts in-progress tasks across the subtree, including the node itself', async () => {
    const ctx = await setup()
    const pid = await createProject(ctx, 'P')
    const root = await createTask(ctx, pid, '根')
    const kid = await createTask(ctx, pid, '子', root)
    await setStatus(ctx, root, 'in_progress')
    await setStatus(ctx, kid, 'in_progress')

    const r = await rollups(ctx, pid)
    expect(r[root]).toEqual({ progress: 0, inProgress: 2, overdue: 0 })
    expect(r[kid]!.inProgress).toBe(1)
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
  })
})

describe('the overdue flag, decided in the account timezone', () => {
  // UTC+14. Noon UTC is already the next calendar day here, which is what makes the cut below
  // differ from the ones a server reading its own clock would build.
  const TZ = 'Pacific/Kiritimati'
  // 02:00 on 2026-10-13 in Kiritimati, still the 12th in UTC.
  const NOW = new Date('2026-10-12T12:00:00Z')
  const dayOffset = (days: number) => new Date(NOW.getTime() + days * DAY_MS).toISOString()

  it('counts a past deadline as overdue, up the tree', async () => {
    const ctx = await setup(TZ, NOW)
    const pid = await createProject(ctx, 'P')
    const root = await createTask(ctx, pid, '根')
    const late = await createTask(ctx, pid, '逾期的', root)
    await setDue(ctx, late, dayOffset(-3))

    const r = await rollups(ctx, pid)
    expect(r[late]!.overdue).toBe(1)
    expect(r[root]!.overdue).toBe(1)
  })

  it('does not count a coming deadline', async () => {
    const ctx = await setup(TZ, NOW)
    const pid = await createProject(ctx, 'P')
    const root = await createTask(ctx, pid, '根')
    const soon = await createTask(ctx, pid, '快到期', root)
    await setDue(ctx, soon, dayOffset(1))

    const r = await rollups(ctx, pid)
    expect(r[soon]!.overdue).toBe(0)
    expect(r[root]!.overdue).toBe(0)
  })

  it('stops counting a passed deadline once the task is finished', async () => {
    const ctx = await setup(TZ, NOW)
    const pid = await createProject(ctx, 'P')
    const done = await createTask(ctx, pid, '做完了但逾期')
    await setDue(ctx, done, dayOffset(-3))
    expect((await rollups(ctx, pid))[done]).toMatchObject({ overdue: 1 })

    await setStatus(ctx, done, 'done')
    // A deadline that has passed on something already finished is not a problem to report.
    expect((await rollups(ctx, pid))[done]).toMatchObject({ overdue: 0 })
  })

  it('does not call a deadline that passed EARLIER TODAY overdue', async () => {
    // THE CUT IS THE START OF TODAY, not `now()`. A deadline at 09:00 that it is now 14:00 past
    // has not "gone" in the sense this app means -- the day it was due is the day in progress,
    // and the Overdue panel would otherwise fill up with things the person is still working on.
    const ctx = await setup(TZ, NOW)
    const pid = await createProject(ctx, 'P')
    const id = await createTask(ctx, pid, '今天早些时候到期')

    // 01:00 local: after the start of the account's day, an hour before now.
    await setDue(ctx, id, new Date(NOW.getTime() - 3_600_000).toISOString())

    expect((await rollups(ctx, pid))[id]).toMatchObject({ overdue: 0 })
  })

  it('agrees with the today view about which tasks are overdue', async () => {
    // The project banner and the Overdue panel must not disagree about the same task, which is why
    // both cut at the start of today in the account's zone rather than at `now()`.
    const ctx = await setup(TZ, NOW)
    const pid = await createProject(ctx, 'P')
    const late = await createTask(ctx, pid, '逾期的')
    await setDue(ctx, late, dayOffset(-3))

    const todayRes = await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/tasks?view=today',
      headers: ctx.authed,
    })
    const segments = (todayRes.json().tasks as { id: string; segment: string }[]).filter(
      (t) => t.segment === 'overdue',
    )
    expect(segments.map((t) => t.id)).toEqual([late])
    expect((await rollups(ctx, pid))[late]).toMatchObject({ overdue: 1 })
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
    ).json() as { workspaceId: WorkspaceId }

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
