import { randomUUID } from 'node:crypto'
import { sql } from 'drizzle-orm'
import { afterEach, describe, expect, it } from 'vitest'
import { setupWith, tasksOf, type Harness, secondUser } from '../../helpers/harness'
import { createChain, createOrganisation, createProject, createTask } from '../../helpers/builders'

const cleanups: (() => Promise<void>)[] = []

const setup = () => setupWith(cleanups)
afterEach(async () => {
  while (cleanups.length) await cleanups.pop()!()
})

function list(ctx: Harness, projectId: string, headers = ctx.authed) {
  return ctx.app.inject({ method: 'GET', url: `/api/v1/tasks?projectId=${projectId}`, headers })
}

function del(ctx: Harness, id: string) {
  return ctx.app.inject({ method: 'DELETE', url: `/api/v1/tasks/${id}`, headers: ctx.authed })
}

describe('GET /tasks?projectId', () => {
  it('names the organisations each task is linked to, from either end, and no others', async () => {
    const ctx = await setup()
    const p = await createProject(ctx, 'Job hunt')
    const amazon = await createTask(ctx, p, 'Amazon')
    const stripe = await createTask(ctx, p, 'Stripe')
    await createTask(ctx, p, 'Update the CV')
    const aws = await createOrganisation(ctx, { name: 'Amazon Web Services' })
    const st = await createOrganisation(ctx, { name: 'Stripe' })
    const relate = (from: object, to: object) =>
      ctx.app.inject({
        method: 'POST',
        url: '/api/v1/relations',
        headers: ctx.authed,
        payload: { from, to },
      })
    // One linked from the task, one from the organisation: a relation is one fact.
    expect(
      (await relate({ type: 'task', id: amazon }, { type: 'organisation', id: aws.id })).statusCode,
    ).toBe(201)
    expect(
      (await relate({ type: 'organisation', id: st.id }, { type: 'task', id: stripe })).statusCode,
    ).toBe(201)

    const organisations = (await list(ctx, p)).json().organisations
    expect(organisations).toEqual({
      [amazon]: [{ id: aws.id, title: 'Amazon Web Services' }],
      [stripe]: [{ id: st.id, title: 'Stripe' }],
    })
  })

  it('returns a flat array, not a nested tree', async () => {
    const ctx = await setup()
    const p = await createProject(ctx, 'P')
    const [root] = await createChain(ctx, p, 2)
    const rows = (await list(ctx, p)).json().tasks as Record<string, unknown>[]
    expect(rows).toHaveLength(2)
    for (const r of rows) {
      expect(r).toHaveProperty('parentId')
      expect(r).toHaveProperty('rank')
      expect(r).not.toHaveProperty('children')
    }
    expect(rows.find((r) => r.id === root)!.parentId).toBeNull()
  })

  it('returns every task of the project regardless of depth', async () => {
    const ctx = await setup()
    const p = await createProject(ctx, 'P')
    const chain = await createChain(ctx, p, 5)
    const ids = (await tasksOf(ctx, p)).map((t) => t.id)
    expect([...ids].sort()).toEqual([...chain].sort())
  })

  it('orders siblings by rank then id', async () => {
    const ctx = await setup()
    const p = await createProject(ctx, 'P')
    const ids: string[] = []
    for (let i = 0; i < 8; i++) ids.push(await createTask(ctx, p, `t${i}`))
    const first = await createTask(ctx, p, 'first')
    // The public API never produces equal ranks, so collide them directly. Rewriting the rows in a
    // scrambled order moves their heap position away from id order, so a sort on rank alone
    // cannot land on id order by accident.
    for (const i of [5, 2, 7, 0, 3, 6, 1, 4]) {
      await ctx.db.execute(sql`update tasks set rank = 'm' where id = ${ids[i]!}`)
    }
    await ctx.db.execute(sql`update tasks set rank = 'a' where id = ${first}`)
    // Precondition, kept so this test cannot go vacuous: the tie-break only matters if the heap
    // order differs from id order. If Postgres stops scrambling, fail here instead of passing.
    const heap = await ctx.db.execute(sql`select id from tasks where rank = 'm' order by ctid`)
    const heapIds = (heap.rows as { id: string }[]).map((r) => r.id)
    const idOrder = [...ids].sort()
    expect(heapIds, 'scramble did not take effect: heap order equals id order').not.toEqual(idOrder)
    const got = (await tasksOf(ctx, p)).map((t) => t.id)
    expect(got).toEqual([first, ...idOrder])
  })

  it('excludes soft-deleted tasks', async () => {
    const ctx = await setup()
    const p = await createProject(ctx, 'P')
    const keep = await createTask(ctx, p, 'keep')
    const gone = await createTask(ctx, p, 'gone')
    expect((await del(ctx, gone)).statusCode).toBe(204)
    expect((await tasksOf(ctx, p)).map((t) => t.id)).toEqual([keep])
  })

  it('removes the whole subtree when a parent is soft-deleted', async () => {
    const ctx = await setup()
    const p = await createProject(ctx, 'P')
    const keep = await createTask(ctx, p, 'keep')
    const chain = await createChain(ctx, p, 4)
    await createTask(ctx, p, 'child2', chain[0])
    expect((await del(ctx, chain[0]!)).statusCode).toBe(204)
    const ids = (await tasksOf(ctx, p)).map((t) => t.id)
    expect(ids).toEqual([keep])
  })

  it('excludes tasks of other projects', async () => {
    const ctx = await setup()
    const p1 = await createProject(ctx, 'P1')
    const p2 = await createProject(ctx, 'P2')
    const mine = await createTask(ctx, p1, 'mine')
    await createTask(ctx, p2, 'theirs')
    expect((await tasksOf(ctx, p1)).map((t) => t.id)).toEqual([mine])
  })

  it('404s for a project in another workspace', async () => {
    const ctx = await setup()
    const p = await createProject(ctx, 'P')
    await createTask(ctx, p, 't')
    const other = (await secondUser(ctx)).authed
    expect((await list(ctx, p, other)).statusCode).toBe(404)
    expect((await list(ctx, p)).statusCode).toBe(200)
  })

  it('404s for a project that does not exist', async () => {
    const ctx = await setup()
    expect((await list(ctx, randomUUID())).statusCode).toBe(404)
  })

  it('404s for a soft-deleted project', async () => {
    const ctx = await setup()
    const p = await createProject(ctx, 'P')
    await ctx.app.inject({ method: 'DELETE', url: `/api/v1/projects/${p}`, headers: ctx.authed })
    expect((await list(ctx, p)).statusCode).toBe(404)
  })
})
