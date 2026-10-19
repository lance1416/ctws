import type { TaskId } from '@ctws/contracts'
import { afterEach, describe, expect, it } from 'vitest'
import { createProject, createTask } from '../../helpers/builders'
import { appWithUser, eventsOf, type Harness } from '../../helpers/harness'

/**
 * A PARENT'S STATUS IS ITS CHILDREN'S (FR-038, FR-039, FR-043, FR-041).
 *
 * The status column of a task with subtasks is written by the service, never by a request: it is
 * settled after every change to a child, logged as `status_changed` with `derived: true`, and the
 * review does not count it. Only leaves appear where "in progress" or "ready to start" is listed.
 */
const cleanups: (() => Promise<void>)[] = []
afterEach(async () => {
  for (const stop of cleanups.splice(0)) await stop()
})

async function setup() {
  const ctx = await appWithUser()
  cleanups.push(ctx.stop)
  const projectId = await createProject(ctx, 'Job hunt')
  return { ctx, projectId }
}

async function statusOf(ctx: Harness, id: TaskId): Promise<string> {
  const res = await ctx.app.inject({
    method: 'GET',
    url: `/api/v1/tasks/${id}`,
    headers: ctx.authed,
  })
  expect(res.statusCode, res.body).toBe(200)
  return (res.json() as { status: string }).status
}

async function patchTask(ctx: Harness, id: TaskId, body: object) {
  return ctx.app.inject({
    method: 'PATCH',
    url: `/api/v1/tasks/${id}`,
    headers: ctx.authed,
    payload: body,
  })
}

async function setStatus(ctx: Harness, id: TaskId, status: string) {
  const res = await patchTask(ctx, id, { status })
  expect(res.statusCode, res.body).toBe(200)
}

describe('a parent takes its status from its children', () => {
  it("follows FR-038's own example: Done, Cancelled, To do", async () => {
    const { ctx, projectId } = await setup()
    const amazon = await createTask(ctx, projectId, 'Amazon', undefined, { status: 'in_progress' })
    const a = await createTask(ctx, projectId, 'a', amazon, { status: 'done' })
    await createTask(ctx, projectId, 'b', amazon, { status: 'cancelled' })
    const c = await createTask(ctx, projectId, 'c', amazon)
    expect(await statusOf(ctx, amazon)).toBe('in_progress')

    await setStatus(ctx, c, 'done')
    expect(await statusOf(ctx, amazon)).toBe('done')

    // Still one Done among the closed children.
    await setStatus(ctx, a, 'cancelled')
    expect(await statusOf(ctx, amazon)).toBe('done')

    await setStatus(ctx, c, 'cancelled')
    expect(await statusOf(ctx, amazon)).toBe('cancelled')
  })

  it('settles the whole chain, and logs each derived change as derived', async () => {
    const { ctx, projectId } = await setup()
    const root = await createTask(ctx, projectId, 'root')
    const mid = await createTask(ctx, projectId, 'mid', root)
    const leaf = await createTask(ctx, projectId, 'leaf', mid)
    await setStatus(ctx, leaf, 'in_progress')
    expect(await statusOf(ctx, mid)).toBe('in_progress')
    expect(await statusOf(ctx, root)).toBe('in_progress')

    const events = await eventsOf(ctx, root)
    expect(events.filter((e) => e.type === 'status_changed')).toEqual([
      { type: 'status_changed', payload: { from: 'todo', to: 'in_progress', derived: true } },
    ])
  })

  it('refuses to set a parent’s status or planned day by hand', async () => {
    const { ctx, projectId } = await setup()
    const parent = await createTask(ctx, projectId, 'parent')
    await createTask(ctx, projectId, 'child', parent)

    const status = await patchTask(ctx, parent, { status: 'done' })
    expect(status.statusCode).toBe(422)
    expect(status.json().detail).toBe('a task with subtasks takes its status from them')

    const planned = await patchTask(ctx, parent, { scheduledOn: '2026-10-30' })
    expect(planned.statusCode).toBe(422)
    expect(planned.json().detail).toBe('a task with subtasks is planned by its subtasks')

    // Its deadline is its own.
    const due = await patchTask(ctx, parent, { dueAt: '2026-10-30T18:00:00+00:00' })
    expect(due.statusCode, due.body).toBe(200)
  })
})

describe('a leaf becoming a parent, and back', () => {
  it('hands its planned day down to its first child and takes the derived status', async () => {
    const { ctx, projectId } = await setup()
    const stripe = await createTask(ctx, projectId, 'Stripe', undefined, {
      status: 'in_progress',
      scheduledOn: '2026-10-20',
    })
    const child = await createTask(ctx, projectId, 'Phone screen prep', stripe)

    expect(await statusOf(ctx, stripe)).toBe('todo')
    const read = await ctx.app.inject({
      method: 'GET',
      url: `/api/v1/tasks/${child}`,
      headers: ctx.authed,
    })
    expect(read.json().scheduledOn).toBe('2026-10-20')
    const parent = await ctx.app.inject({
      method: 'GET',
      url: `/api/v1/tasks/${stripe}`,
      headers: ctx.authed,
    })
    expect(parent.json().scheduledOn).toBeNull()

    const types = (await eventsOf(ctx, stripe)).map((e) => e.type)
    expect(types).toEqual(['created', 'became_parent', 'scheduled_changed', 'status_changed'])
  })

  it('keeps a child’s own planned day rather than overwriting it', async () => {
    const { ctx, projectId } = await setup()
    const parent = await createTask(ctx, projectId, 'p', undefined, { scheduledOn: '2026-10-20' })
    const child = await createTask(ctx, projectId, 'c', parent, { scheduledOn: '2026-10-22' })
    const read = await ctx.app.inject({
      method: 'GET',
      url: `/api/v1/tasks/${child}`,
      headers: ctx.authed,
    })
    expect(read.json().scheduledOn).toBe('2026-10-22')
  })

  it('turns back into a leaf when its last child goes, keeping the derived status', async () => {
    const { ctx, projectId } = await setup()
    const parent = await createTask(ctx, projectId, 'p', undefined, { status: 'in_progress' })
    const child = await createTask(ctx, projectId, 'c', parent)
    expect(await statusOf(ctx, parent)).toBe('todo')

    const del = await ctx.app.inject({
      method: 'DELETE',
      url: `/api/v1/tasks/${child}`,
      headers: ctx.authed,
    })
    expect(del.statusCode).toBe(204)
    expect(await statusOf(ctx, parent)).toBe('todo')
    const types = (await eventsOf(ctx, parent)).map((e) => e.type)
    expect(types).toEqual(['created', 'became_parent', 'status_changed', 'became_leaf'])

    // A leaf again: its status is its own to set.
    await setStatus(ctx, parent, 'done')
    expect(await statusOf(ctx, parent)).toBe('done')
  })

  it('settles both the old and the new parent on a move', async () => {
    const { ctx, projectId } = await setup()
    const from = await createTask(ctx, projectId, 'from')
    const to = await createTask(ctx, projectId, 'to')
    const leaf = await createTask(ctx, projectId, 'leaf', from, { status: 'in_progress' })
    expect(await statusOf(ctx, from)).toBe('in_progress')

    const moved = await patchTask(ctx, leaf, { projectId, parentId: to })
    expect(moved.statusCode, moved.body).toBe(200)
    expect(await statusOf(ctx, to)).toBe('in_progress')
    // `from` lost its only child: a leaf again, holding the last derived status.
    expect(await statusOf(ctx, from)).toBe('in_progress')
    expect((await eventsOf(ctx, from)).map((e) => e.type)).toContain('became_leaf')
    expect((await eventsOf(ctx, to)).map((e) => e.type)).toContain('became_parent')
  })
})

describe('only leaves are listed as in progress or ready', () => {
  async function today(ctx: Harness) {
    const res = await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/tasks?view=today',
      headers: ctx.authed,
    })
    expect(res.statusCode).toBe(200)
    return res.json().tasks as { id: string; segment: string; path: { title: string }[] }[]
  }
  async function ready(ctx: Harness) {
    const res = await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/tasks?view=ready',
      headers: ctx.authed,
    })
    expect(res.statusCode).toBe(200)
    return res.json().tasks as { id: string; path: { title: string }[] }[]
  }

  it('shows the in-progress leaf with its path, never Amazon itself (FR-037)', async () => {
    const { ctx, projectId } = await setup()
    const amazon = await createTask(ctx, projectId, 'Amazon')
    const role = await createTask(ctx, projectId, 'SDE II', amazon)
    const leaf = await createTask(ctx, projectId, 'Prepare the system design round', role, {
      status: 'in_progress',
    })
    const rows = await today(ctx)
    expect(rows.map((r) => r.id)).toEqual([leaf])
    expect(rows[0]?.path.map((s) => s.title)).toEqual(['Amazon', 'SDE II'])
  })

  it('recommends only unblocked to-do leaves (FR-041)', async () => {
    const { ctx, projectId } = await setup()
    const amazon = await createTask(ctx, projectId, 'Amazon')
    const prep = await createTask(ctx, projectId, 'Prepare', amazon)
    const flights = await createTask(ctx, projectId, 'Book flights to Seattle', amazon)
    const started = await createTask(ctx, projectId, 'Started', undefined, {
      status: 'in_progress',
    })
    const later = await createTask(ctx, projectId, 'Later', undefined, { status: 'backlog' })
    const wait = await ctx.app.inject({
      method: 'PUT',
      url: `/api/v1/tasks/${flights}/dependencies/${prep}`,
      headers: ctx.authed,
    })
    expect(wait.statusCode).toBe(204)

    expect((await ready(ctx)).map((r) => r.id)).toEqual([prep])
    expect((await ready(ctx)).map((r) => r.id)).not.toContain(amazon)
    expect((await ready(ctx)).map((r) => r.id)).not.toContain(started)
    expect((await ready(ctx)).map((r) => r.id)).not.toContain(later)

    await setStatus(ctx, prep, 'done')
    expect((await ready(ctx)).map((r) => r.id)).toEqual([flights])
  })
})

describe('the review counts leaves', () => {
  it('lists a closed parent as a heading, not as one more thing finished (FR-043)', async () => {
    const { ctx, projectId } = await setup()
    const amazon = await createTask(ctx, projectId, 'Amazon')
    const a = await createTask(ctx, projectId, 'a', amazon)
    const b = await createTask(ctx, projectId, 'b', amazon)
    await setStatus(ctx, a, 'done')
    await setStatus(ctx, b, 'done')

    const res = await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/tasks?view=review',
      headers: ctx.authed,
    })
    expect(res.statusCode, res.body).toBe(200)
    const [project] = res.json().projects as {
      finished: { id: string }[]
      started: { id: string }[]
      closedParents: { id: string; title: string }[]
    }[]
    expect(project?.finished.map((t) => t.id).sort()).toEqual([a, b].sort())
    expect(project?.started).toEqual([])
    expect(project?.closedParents).toEqual([
      { id: amazon, title: 'Amazon', at: expect.any(String) },
    ])
  })
})
