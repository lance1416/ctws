import { randomUUID } from 'node:crypto'
import { sql } from 'drizzle-orm'
import { afterEach, describe, expect, it } from 'vitest'
import {
  createChain,
  createProject,
  createTask,
  eventsOf,
  expectBlockedByTreeLock,
  setupWith,
  tasksOf,
  type Harness,
} from '../../helpers/harness'

const cleanups: (() => Promise<void>)[] = []

const setup = () => setupWith(cleanups)
afterEach(async () => {
  while (cleanups.length) await cleanups.pop()!()
})

const headers = { 'x-ctws-client': 'web' }

function move(
  ctx: Harness,
  id: string,
  payload: Record<string, unknown>,
  auth: Record<string, string> = ctx.authed,
) {
  return ctx.app.inject({
    method: 'POST',
    url: `/api/v1/tasks/${id}/move`,
    headers: auth,
    payload,
  })
}

describe('POST /tasks/:id/move', () => {
  it('reorders among siblings and only writes the moved row', async () => {
    const ctx = await setup()
    const p = await createProject(ctx, 'p')
    const a = await createTask(ctx, p, 'a')
    const b = await createTask(ctx, p, 'b')
    const c = await createTask(ctx, p, 'c')

    const ranksBefore = new Map((await tasksOf(ctx, p)).map((t) => [t.id, t.rank]))

    // Move c to the very front, i.e. before a.
    const res = await move(ctx, c, { projectId: p, parentId: null, beforeId: a })
    expect(res.statusCode).toBe(200)

    const after = await tasksOf(ctx, p)
    // Only the moved row is written, never its siblings.
    expect(after.find((t) => t.id === a)!.rank).toBe(ranksBefore.get(a))
    expect(after.find((t) => t.id === b)!.rank).toBe(ranksBefore.get(b))
    expect(after.find((t) => t.id === c)!.rank).not.toBe(ranksBefore.get(c))
    // tasksOf orders by (rank, id), so the new order is observable.
    expect(after.map((t) => t.id)).toEqual([c, a, b])
  })

  it('reparents a task under a new parent', async () => {
    const ctx = await setup()
    const p = await createProject(ctx, 'p')
    const a = await createTask(ctx, p, 'a')
    const b = await createTask(ctx, p, 'b')

    const res = await move(ctx, b, { projectId: p, parentId: a })
    expect(res.statusCode).toBe(200)
    expect(res.json().parentId).toBe(a)
    expect((await tasksOf(ctx, p)).find((t) => t.id === b)!.parentId).toBe(a)
  })

  it('moves a task to the project root with parentId null', async () => {
    const ctx = await setup()
    const p = await createProject(ctx, 'p')
    const chain = await createChain(ctx, p, 2)

    const res = await move(ctx, chain[1]!, { projectId: p, parentId: null })
    expect(res.statusCode).toBe(200)
    expect(res.json().parentId).toBeNull()
    expect((await tasksOf(ctx, p)).find((t) => t.id === chain[1])!.parentId).toBeNull()
  })

  // Postgres recursive CTEs have no cycle detection: once a cycle exists, any
  // later subtree query recurses until memory runs out. This is not an error, it takes the
  // database down.
  it.each([
    ['its own child', 1],
    ['its own grandchild', 2],
    ['itself', 0],
  ])('refuses to move a task under %s', async (_label, depthBelow) => {
    const ctx = await setup()
    const p = await createProject(ctx, 'p')
    const chain = await createChain(ctx, p, 3) // chain[0] is the root
    const target = depthBelow === 0 ? chain[0]! : chain[depthBelow]!

    const res = await ctx.app.inject({
      method: 'POST',
      url: `/api/v1/tasks/${chain[0]}/move`,
      headers: ctx.authed,
      payload: { projectId: p, parentId: target },
    })
    expect(res.statusCode).toBe(409)
    expect(res.headers['content-type']).toContain('application/problem+json')
    // WHICH 409. Depth and cycle both answer 409, so the status alone passes for a bug that
    // reports one as the other -- and the two are told apart by what the person is then supposed
    // to do about it. Asserted on the semantic core of the sentence, not the whole wording.
    expect(res.json().detail).toMatch(/under itself/)

    // The tree must be untouched, so a later subtree query cannot recurse forever.
    const after = await tasksOf(ctx, p)
    expect(after.find((t) => t.id === chain[0])!.parentId).toBeNull()
  })

  // A cycle through a soft-deleted row is just as fatal: a subtree query that does not filter
  // `deleted_at` still recurses forever.
  it('refuses to move a task under a soft-deleted descendant', async () => {
    const ctx = await setup()
    const p = await createProject(ctx, 'p')
    const chain = await createChain(ctx, p, 2)

    const deleted = await ctx.app.inject({
      method: 'DELETE',
      url: `/api/v1/tasks/${chain[1]}`,
      headers: ctx.authed,
    })
    expect(deleted.statusCode).toBe(204)

    // The descendant is gone from sight but still a row, so the cycle would still be real.
    // Not-found wins over conflict here (the parent itself is invisible), but either way the
    // move must be refused and the tree must be unchanged.
    const res = await move(ctx, chain[0]!, { projectId: p, parentId: chain[1]! })
    expect(res.statusCode).toBe(404)
    expect((await tasksOf(ctx, p)).find((t) => t.id === chain[0])!.parentId).toBeNull()
  })

  // An accepted judgement call, pinned here because nothing else holds it: when a parent is
  // given, the PARENT's project wins and the client's `projectId` is ignored, exactly as in
  // createTask. A child's project must equal its parent's, and making that
  // unviolable beats validating it. Without this test the next reader can reasonably decide the
  // client's value should win and see a fully green suite.
  it('takes the project from the parent, ignoring the client projectId', async () => {
    const ctx = await setup()
    const a = await createProject(ctx, 'a')
    const b = await createProject(ctx, 'b')
    const parent = await createTask(ctx, a, 'parent in a')
    // The moved task brings a subtree, so the cascade has to follow the parent's project too.
    const chain = await createChain(ctx, b, 2)

    // `projectId` names b -- a project this user legitimately owns -- while the parent lives in a.
    const res = await move(ctx, chain[0]!, { projectId: b, parentId: parent })
    expect(res.statusCode).toBe(200)
    expect(res.json().projectId).toBe(a)

    // The whole subtree followed the parent into a, and nothing was left behind in b.
    const landed = await tasksOf(ctx, a)
    expect(landed.map((t) => t.id).sort()).toEqual([parent, ...chain].sort())
    expect(await tasksOf(ctx, b)).toEqual([])
  })

  // Silent corruption: no error, just a permanently wrong answer to
  // "all tasks of this project".
  it('cascades project_id to the whole moved subtree, not just the moved row', async () => {
    const ctx = await setup()
    const from = await createProject(ctx, 'from')
    const to = await createProject(ctx, 'to')
    const chain = await createChain(ctx, from, 3) // root -> child -> grandchild

    const res = await ctx.app.inject({
      method: 'POST',
      url: `/api/v1/tasks/${chain[0]}/move`,
      headers: ctx.authed,
      payload: { projectId: to, parentId: null },
    })
    expect(res.statusCode).toBe(200)

    // Every level, not just the moved row.
    const moved = await tasksOf(ctx, to)
    expect(moved.map((t) => t.id).sort()).toEqual([...chain].sort())
    expect(await tasksOf(ctx, from)).toEqual([])
  })

  // `project_id` is an identity attribute, not a visibility one: a soft-deleted descendant left
  // behind in the old project would be restored into the wrong project later.
  it('cascades project_id to soft-deleted descendants too', async () => {
    const ctx = await setup()
    const from = await createProject(ctx, 'from')
    const to = await createProject(ctx, 'to')
    const chain = await createChain(ctx, from, 3)

    const deleted = await ctx.app.inject({
      method: 'DELETE',
      url: `/api/v1/tasks/${chain[2]}`,
      headers: ctx.authed,
    })
    expect(deleted.statusCode).toBe(204)

    expect((await move(ctx, chain[0]!, { projectId: to, parentId: null })).statusCode).toBe(200)

    const rows = await ctx.db.execute(sql`
      select project_id from tasks where id = ${chain[2]}
    `)
    expect((rows.rows[0] as { project_id: string }).project_id).toBe(to)
  })

  // Must account for the moved subtree's own height, not just the node.
  it('refuses a move that would push the subtree past MAX_DEPTH', async () => {
    const ctx = await setup()
    const p = await createProject(ctx, 'p')
    const deep = await createChain(ctx, p, 8) // deepest node sits at depth 8
    const subtree = await createChain(ctx, p, 3) // root plus two descendants: height 3

    // 8 + 1 + 2 = 11 > MAX_DEPTH. Checking only the moved node's own depth (9) would pass.
    const res = await ctx.app.inject({
      method: 'POST',
      url: `/api/v1/tasks/${subtree[0]}/move`,
      headers: ctx.authed,
      payload: { projectId: p, parentId: deep[7] },
    })
    expect(res.statusCode).toBe(409)
    // The depth check refuses it, not the cycle check: the bounded walk cannot see this far down.
    expect(res.json().detail).toMatch(/nested at most/)
  })

  it('allows a move that lands exactly at MAX_DEPTH', async () => {
    const ctx = await setup()
    const p = await createProject(ctx, 'p')
    const deep = await createChain(ctx, p, 8)
    const subtree = await createChain(ctx, p, 2) // height 2: 8 + 1 + 1 = 10

    const res = await ctx.app.inject({
      method: 'POST',
      url: `/api/v1/tasks/${subtree[0]}/move`,
      headers: ctx.authed,
      payload: { projectId: p, parentId: deep[7] },
    })
    expect(res.statusCode).toBe(200)
  })

  // `liveHeight` must be a HEIGHT, not a row count. Every other depth test uses createChain,
  // where the two coincide, so substituting `.length` for the max-depth computation passes them
  // all -- while falsely refusing this move, which is the user-visible bug.
  it('measures the subtree height, not its node count', async () => {
    const ctx = await setup()
    const p = await createProject(ctx, 'p')
    const deep = await createChain(ctx, p, 8) // deepest node sits at depth 8
    const root = await createTask(ctx, p, 'bushy root')
    for (const title of ['x', 'y', 'z']) await createTask(ctx, p, title, root)

    // Four nodes, but height 2: 8 + 1 + 1 = 10 fits exactly. A count would give 8 + 4 = 12.
    const res = await move(ctx, root, { projectId: p, parentId: deep[7]! })
    expect(res.statusCode).toBe(200)

    // And the whole bush came along, so the move is legal in substance and not just in status.
    const rows = await tasksOf(ctx, p)
    expect(rows.filter((t) => t.parentId === root)).toHaveLength(3)
    expect(rows.find((t) => t.id === root)!.parentId).toBe(deep[7])
  })

  // A soft-deleted descendant is invisible, so it must not make a legal move illegal.
  it('ignores soft-deleted descendants when measuring the subtree height', async () => {
    const ctx = await setup()
    const p = await createProject(ctx, 'p')
    const deep = await createChain(ctx, p, 8)
    const subtree = await createChain(ctx, p, 3) // height 3 while all three are live

    // Deleting the leaf brings the live height back to 2, so 8 + 1 + 1 = 10 fits.
    const deleted = await ctx.app.inject({
      method: 'DELETE',
      url: `/api/v1/tasks/${subtree[2]}`,
      headers: ctx.authed,
    })
    expect(deleted.statusCode).toBe(204)

    const res = await move(ctx, subtree[0]!, { projectId: p, parentId: deep[7]! })
    expect(res.statusCode).toBe(200)
  })

  it('records a moved event with the old and new parent', async () => {
    const ctx = await setup()
    const p = await createProject(ctx, 'p')
    const a = await createTask(ctx, p, 'a')
    const b = await createTask(ctx, p, 'b')

    await ctx.app.inject({
      method: 'POST',
      url: `/api/v1/tasks/${b}/move`,
      headers: ctx.authed,
      payload: { projectId: p, parentId: a },
    })

    const ev = await eventsOf(ctx, b)
    const moved = ev.filter((e) => e.type === 'moved')
    expect(moved).toHaveLength(1)
    expect(moved[0]!.payload).toMatchObject({ from: { parentId: null }, to: { parentId: a } })
  })

  it('records the project change in the moved event', async () => {
    const ctx = await setup()
    const from = await createProject(ctx, 'from')
    const to = await createProject(ctx, 'to')
    const a = await createTask(ctx, from, 'a')

    expect((await move(ctx, a, { projectId: to, parentId: null })).statusCode).toBe(200)

    const moved = (await eventsOf(ctx, a)).filter((e) => e.type === 'moved')
    expect(moved).toHaveLength(1)
    expect(moved[0]!.payload).toMatchObject({
      from: { projectId: from },
      to: { projectId: to },
    })
  })

  // One drag is one event: an event per descendant would be log noise, and would make a
  // reparent look like progress on every child.
  it('records no event on the descendants a cascade touched', async () => {
    const ctx = await setup()
    const from = await createProject(ctx, 'from')
    const to = await createProject(ctx, 'to')
    const chain = await createChain(ctx, from, 3)

    const before = (await eventsOf(ctx, chain[1]!)).length
    expect((await move(ctx, chain[0]!, { projectId: to, parentId: null })).statusCode).toBe(200)

    expect(await eventsOf(ctx, chain[1]!)).toHaveLength(before)
    expect((await eventsOf(ctx, chain[1]!)).filter((e) => e.type === 'moved')).toEqual([])
    expect((await eventsOf(ctx, chain[2]!)).filter((e) => e.type === 'moved')).toEqual([])
  })

  // A pure reorder is not progress. 20 drags during a tidy-up must
  // not become 20 events, or the weekly review and last_activity_at are both wrong.
  it('records no event when only the rank changes', async () => {
    const ctx = await setup()
    const p = await createProject(ctx, 'p')
    const a = await createTask(ctx, p, 'a')
    const b = await createTask(ctx, p, 'b')
    const before = (await eventsOf(ctx, b)).length

    // Reorder b ahead of a: same parent, same project, only the rank moves.
    const res = await ctx.app.inject({
      method: 'POST',
      url: `/api/v1/tasks/${b}/move`,
      headers: ctx.authed,
      payload: { projectId: p, parentId: null, beforeId: a },
    })
    expect(res.statusCode).toBe(200)
    expect(await eventsOf(ctx, b)).toHaveLength(before)
  })

  it('reads an upper-case project id as the same project', async () => {
    const ctx = await setup()
    const p = await createProject(ctx, 'p')
    const a = await createTask(ctx, p, 'a')
    const b = await createTask(ctx, p, 'b')
    const before = (await eventsOf(ctx, b)).length

    const res = await ctx.app.inject({
      method: 'POST',
      url: `/api/v1/tasks/${b}/move`,
      headers: ctx.authed,
      payload: { projectId: p.toUpperCase(), parentId: null, beforeId: a },
    })
    expect(res.statusCode).toBe(200)
    expect(await eventsOf(ctx, b)).toHaveLength(before)
  })

  it('rolls back everything when the depth check fails', async () => {
    const ctx = await setup()
    const p = await createProject(ctx, 'p')
    const deep = await createChain(ctx, p, 8)
    const subtree = await createChain(ctx, p, 3)

    const snapshot = await tasksOf(ctx, p)
    const events = (await eventsOf(ctx, subtree[0]!)).length

    const res = await move(ctx, subtree[0]!, { projectId: p, parentId: deep[7]! })
    expect(res.statusCode).toBe(409)

    // parent_id, project_id, rank and the event count are all unchanged.
    expect(await tasksOf(ctx, p)).toEqual(snapshot)
    expect(await eventsOf(ctx, subtree[0]!)).toHaveLength(events)
    const rows = await ctx.db.execute(sql`
      select project_id from tasks where id in (${sql.join(
        subtree.map((s) => sql`${s}`),
        sql`, `,
      )})
    `)
    for (const row of rows.rows as { project_id: string }[]) {
      expect(row.project_id).toBe(p)
    }
  })

  it('404s a task that does not exist', async () => {
    const ctx = await setup()
    const p = await createProject(ctx, 'p')
    const res = await move(ctx, randomUUID(), { projectId: p, parentId: null })
    expect(res.statusCode).toBe(404)
  })

  it('404s a soft-deleted parent, which is not a valid move target', async () => {
    const ctx = await setup()
    const p = await createProject(ctx, 'p')
    const a = await createTask(ctx, p, 'a')
    const parent = await createTask(ctx, p, 'parent')

    const deleted = await ctx.app.inject({
      method: 'DELETE',
      url: `/api/v1/tasks/${parent}`,
      headers: ctx.authed,
    })
    expect(deleted.statusCode).toBe(204)

    // Succeeding would create a live task under a deleted parent: the one state the two guards
    // in softDeleteTask cannot tell apart.
    const res = await move(ctx, a, { projectId: p, parentId: parent })
    expect(res.statusCode).toBe(404)
    expect((await tasksOf(ctx, p)).find((t) => t.id === a)!.parentId).toBeNull()
  })

  it('400s when both beforeId and afterId are given', async () => {
    const ctx = await setup()
    const p = await createProject(ctx, 'p')
    const a = await createTask(ctx, p, 'a')
    const b = await createTask(ctx, p, 'b')
    const c = await createTask(ctx, p, 'c')

    const res = await move(ctx, c, { projectId: p, parentId: null, beforeId: a, afterId: b })
    expect(res.statusCode).toBe(400)
    expect(res.headers['content-type']).toContain('application/problem+json')
  })

  it('400s a neighbour that is not a live sibling under the destination parent', async () => {
    const ctx = await setup()
    const p = await createProject(ctx, 'p')
    const other = await createProject(ctx, 'other')
    const a = await createTask(ctx, p, 'a')
    const parent = await createTask(ctx, p, 'parent')
    const child = await createTask(ctx, p, 'child', parent)
    const elsewhere = await createTask(ctx, other, 'elsewhere')

    // Right project, wrong parent.
    expect((await move(ctx, a, { projectId: p, parentId: null, afterId: child })).statusCode).toBe(
      400,
    )
    // Right parent (root), wrong project.
    expect(
      (await move(ctx, a, { projectId: p, parentId: null, afterId: elsewhere })).statusCode,
    ).toBe(400)
    // Does not exist at all.
    expect(
      (await move(ctx, a, { projectId: p, parentId: null, afterId: randomUUID() })).statusCode,
    ).toBe(400)
    // The moved task is not its own neighbour.
    expect((await move(ctx, a, { projectId: p, parentId: null, afterId: a })).statusCode).toBe(400)

    expect((await tasksOf(ctx, p)).find((t) => t.id === a)!.parentId).toBeNull()
  })

  it('400s a soft-deleted neighbour', async () => {
    const ctx = await setup()
    const p = await createProject(ctx, 'p')
    const a = await createTask(ctx, p, 'a')
    const gone = await createTask(ctx, p, 'gone')
    await ctx.app.inject({ method: 'DELETE', url: `/api/v1/tasks/${gone}`, headers: ctx.authed })

    const res = await move(ctx, a, { projectId: p, parentId: null, beforeId: gone })
    expect(res.statusCode).toBe(400)
  })

  it('places the task after afterId', async () => {
    const ctx = await setup()
    const p = await createProject(ctx, 'p')
    const a = await createTask(ctx, p, 'a')
    const b = await createTask(ctx, p, 'b')
    const c = await createTask(ctx, p, 'c')

    expect((await move(ctx, c, { projectId: p, parentId: null, afterId: a })).statusCode).toBe(200)
    expect((await tasksOf(ctx, p)).map((t) => t.id)).toEqual([a, c, b])
  })

  it('appends to the end when no neighbour is given', async () => {
    const ctx = await setup()
    const p = await createProject(ctx, 'p')
    const a = await createTask(ctx, p, 'a')
    const b = await createTask(ctx, p, 'b')
    const c = await createTask(ctx, p, 'c')

    expect((await move(ctx, a, { projectId: p, parentId: null })).statusCode).toBe(200)
    expect((await tasksOf(ctx, p)).map((t) => t.id)).toEqual([b, c, a])
  })

  // Manual progress is leaf-only. A parent gains a child by move just as it does by
  // create, so move must clear it too, or move becomes a second way to break the invariant.
  it('clears the new parent manual progress and logs it', async () => {
    const ctx = await setup()
    const p = await createProject(ctx, 'p')
    const parent = (
      await ctx.app.inject({
        method: 'POST',
        url: '/api/v1/tasks',
        headers: ctx.authed,
        payload: { projectId: p, title: 'parent', manualProgress: 0.5 },
      })
    ).json().id as string
    const a = await createTask(ctx, p, 'a')

    expect((await move(ctx, a, { projectId: p, parentId: parent })).statusCode).toBe(200)

    const rows = await ctx.db.execute(sql`
      select manual_progress from tasks where id = ${parent}
    `)
    expect((rows.rows[0] as { manual_progress: string | null }).manual_progress).toBeNull()
    const logged = (await eventsOf(ctx, parent)).filter((e) => e.type === 'progress_set')
    expect(logged).toHaveLength(1)
    expect(logged[0]!.payload).toMatchObject({ from: 0.5, to: null })
  })

  // The cycle check is read-then-write, so two concurrent moves -- A under B and B under A --
  // could each pass their own check and together commit a cycle. The guard is a workspace-keyed
  // advisory lock taken as the transaction's first statement; see expectBlockedByTreeLock for
  // what this proves and what it does not.
  it('contends on the workspace-keyed tree lock', async () => {
    const ctx = await setup()
    const p = await createProject(ctx, 'p')
    const a = await createTask(ctx, p, 'a')
    const b = await createTask(ctx, p, 'b')

    const res = await expectBlockedByTreeLock(ctx, () =>
      move(ctx, a, { projectId: p, parentId: b }),
    )
    expect(res.statusCode).toBe(200)
    expect((await tasksOf(ctx, p)).find((t) => t.id === a)!.parentId).toBe(b)
  })
})

describe('move workspace isolation', () => {
  async function secondUser(ctx: Harness) {
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      headers,
      payload: { email: 'other@example.com', password: 'correct horse battery', timezone: 'UTC' },
    })
    return { ...headers, cookie: String(res.headers['set-cookie']).split(';')[0]! }
  }

  it('cannot move another workspace task', async () => {
    const ctx = await setup()
    const p = await createProject(ctx, 'mine')
    const id = await createTask(ctx, p, 'mine')
    const bAuthed = await secondUser(ctx)

    const bProject = (
      await ctx.app.inject({
        method: 'POST',
        url: '/api/v1/projects',
        headers: bAuthed,
        payload: { name: 'theirs' },
      })
    ).json().id as string

    const res = await move(ctx, id, { projectId: bProject, parentId: null }, bAuthed)
    expect(res.statusCode).toBe(404)
    expect((await tasksOf(ctx, p)).map((t) => t.id)).toEqual([id])
  })

  it('cannot move a task into another workspace project', async () => {
    const ctx = await setup()
    const p = await createProject(ctx, 'mine')
    const id = await createTask(ctx, p, 'mine')
    const bAuthed = await secondUser(ctx)

    const bProject = (
      await ctx.app.inject({
        method: 'POST',
        url: '/api/v1/projects',
        headers: bAuthed,
        payload: { name: 'theirs' },
      })
    ).json().id as string

    const res = await move(ctx, id, { projectId: bProject, parentId: null })
    expect(res.statusCode).toBe(404)
    expect((await tasksOf(ctx, p)).map((t) => t.id)).toEqual([id])
  })
})
