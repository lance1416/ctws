import { randomUUID } from 'node:crypto'
import { sql } from 'drizzle-orm'
import { afterEach, describe, expect, it } from 'vitest'
import { TaskNotFoundError } from '../../../src/modules/tasks/errors'
import { moveTask } from '../../../src/modules/tasks/commands/move'
import { softDeleteTask } from '../../../src/modules/tasks/commands/remove'
import { updateTask } from '../../../src/modules/tasks/commands/update'
import {
  createChain,
  createProject,
  createTask,
  eventsOf,
  expectBlockedByTreeLock,
  setupWith,
  type Harness,
} from '../../helpers/harness'

const cleanups: (() => Promise<void>)[] = []

const setup = () => setupWith(cleanups)
afterEach(async () => {
  while (cleanups.length) await cleanups.pop()!()
})

const headers = { 'x-ctws-client': 'web' }

function post(ctx: Harness, payload: Record<string, unknown>) {
  return ctx.app.inject({ method: 'POST', url: '/api/v1/tasks', headers: ctx.authed, payload })
}

function patch(ctx: Harness, id: string, payload: Record<string, unknown>) {
  return ctx.app.inject({
    method: 'PATCH',
    url: `/api/v1/tasks/${id}`,
    headers: ctx.authed,
    payload,
  })
}

function del(ctx: Harness, id: string) {
  return ctx.app.inject({ method: 'DELETE', url: `/api/v1/tasks/${id}`, headers: ctx.authed })
}

/** Raw row, for columns the response does not expose (deleted_at). */
async function rowOf(ctx: Harness, id: string) {
  const r = await ctx.db.execute(sql`
    select project_id, parent_id, deleted_at, completed_at, status from tasks where id = ${id}
  `)
  return r.rows[0] as {
    project_id: string
    parent_id: string | null
    deleted_at: Date | null
    completed_at: Date | null
    status: string
  }
}

describe('create', () => {
  it('creates a task at project root with status todo by default', async () => {
    const ctx = await setup()
    const projectId = await createProject(ctx, 'P')
    const res = await post(ctx, { projectId, title: 'idea' })
    expect(res.statusCode).toBe(201)
    expect(res.json()).toMatchObject({
      projectId,
      parentId: null,
      title: 'idea',
      // `todo`, never `backlog`: the rollup excludes a backlog node before it looks at its
      // children, so a backlog default blanks the progress of every tree.
      status: 'todo',
      notes: null,
      completedAt: null,
    })
    expect(res.json().rank).toEqual(expect.any(String))
  })

  it('appends siblings in order', async () => {
    const ctx = await setup()
    const projectId = await createProject(ctx, 'P')
    const a = (await post(ctx, { projectId, title: 'a' })).json()
    const b = (await post(ctx, { projectId, title: 'b' })).json()
    expect(a.rank < b.rank).toBe(true)
  })

  it('creates a nested task under a parent', async () => {
    const ctx = await setup()
    const projectId = await createProject(ctx, 'P')
    const parentId = await createTask(ctx, projectId, 'parent')
    const res = await post(ctx, { projectId, parentId, title: 'child' })
    expect(res.statusCode).toBe(201)
    expect(res.json()).toMatchObject({ parentId, projectId })
  })

  // The child's project_id must equal the parent's. Trusting the client's projectId
  // here would let a caller plant a child whose project_id points elsewhere.
  it('ignores a projectId that disagrees with the parent and uses the parent project', async () => {
    const ctx = await setup()
    const p1 = await createProject(ctx, 'one')
    const p2 = await createProject(ctx, 'two')
    const parentId = await createTask(ctx, p1, 'parent')
    const res = await post(ctx, { projectId: p2, parentId, title: 'child' })
    expect(res.statusCode).toBe(201)
    expect(res.json().projectId).toBe(p1)
    expect((await rowOf(ctx, res.json().id)).project_id).toBe(p1)
  })

  // The parent's project is what gets stored, but the client's projectId is still part of the
  // request and `move` rejects an unresolvable one. Accepting it here would make the two paths
  // disagree, and a 201 is easy to read as "that project id was fine".
  it('404s an unresolvable projectId even when the parent is valid', async () => {
    const ctx = await setup()
    const projectId = await createProject(ctx, 'P')
    const parentId = await createTask(ctx, projectId, 'parent')
    const res = await post(ctx, { projectId: randomUUID(), parentId, title: 'child' })
    expect(res.statusCode).toBe(404)
  })

  it('records a created event', async () => {
    const ctx = await setup()
    const projectId = await createProject(ctx, 'P')
    const id = await createTask(ctx, projectId, 'x')
    const events = await eventsOf(ctx, id)
    expect(events.map((e) => e.type)).toEqual(['created'])
  })

  it('logs the stored project id, whatever case the client sent', async () => {
    const ctx = await setup()
    const projectId = await createProject(ctx, 'P')
    const res = await post(ctx, { projectId: projectId.toUpperCase(), title: 'x' })
    expect(res.statusCode).toBe(201)
    const [created] = await eventsOf(ctx, res.json().id)
    expect(created!.payload).toMatchObject({ to: { projectId } })
  })

  it('rejects a client-supplied rank', async () => {
    const ctx = await setup()
    const projectId = await createProject(ctx, 'P')
    expect((await post(ctx, { projectId, title: 'x', rank: 'a0' })).statusCode).toBe(400)
  })
})

describe('update', () => {
  it('patches only independent scalar fields', async () => {
    const ctx = await setup()
    const projectId = await createProject(ctx, 'P')
    const id = await createTask(ctx, projectId, 'old')
    const res = await patch(ctx, id, {
      title: 'new',
      notes: 'some notes',
      status: 'todo',
      dueAt: '2026-10-15T23:59:00Z',
      scheduledOn: '2026-10-14',
    })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toMatchObject({
      title: 'new',
      notes: 'some notes',
      status: 'todo',
      dueAt: '2026-10-15T23:59:00.000Z',
      scheduledOn: '2026-10-14',
      projectId,
      parentId: null,
    })
  })

  it('cannot change structure through PATCH', async () => {
    const ctx = await setup()
    const projectId = await createProject(ctx, 'P')
    const id = await createTask(ctx, projectId, 'x')
    for (const key of ['parentId', 'projectId', 'rank']) {
      expect((await patch(ctx, id, { [key]: projectId })).statusCode, key).toBe(400)
    }
  })

  it('records a status_changed event with from and to', async () => {
    const ctx = await setup()
    const projectId = await createProject(ctx, 'P')
    const id = await createTask(ctx, projectId, 'x')
    await patch(ctx, id, { status: 'in_progress' })
    const events = await eventsOf(ctx, id)
    expect(events.map((e) => e.type)).toEqual(['created', 'status_changed'])
    expect(events[1]!.payload).toEqual({ from: 'todo', to: 'in_progress' })
  })

  it('records one event per changed field, with before and after values', async () => {
    const ctx = await setup()
    const projectId = await createProject(ctx, 'P')
    const id = await createTask(ctx, projectId, 'x')
    await patch(ctx, id, { dueAt: '2026-10-15T23:59:00Z', scheduledOn: '2026-10-14' })
    const events = (await eventsOf(ctx, id)).slice(1)
    const byType = Object.fromEntries(events.map((e) => [e.type, e.payload]))
    expect(Object.keys(byType).sort()).toEqual(['due_changed', 'scheduled_changed'])
    expect(byType.due_changed).toEqual({ from: null, to: '2026-10-15T23:59:00.000Z' })
    expect(byType.scheduled_changed).toEqual({ from: null, to: '2026-10-14' })
  })

  it('records no event for a patch that changes nothing', async () => {
    const ctx = await setup()
    const projectId = await createProject(ctx, 'P')
    const id = await createTask(ctx, projectId, 'x')
    await patch(ctx, id, { status: 'todo', dueAt: '2026-10-15T23:59:00Z' })
    const before = (await eventsOf(ctx, id)).length

    // Same values again, including the due date expressed with a different offset.
    const res = await patch(ctx, id, {
      title: 'x',
      status: 'todo',
      dueAt: '2026-10-16T01:59:00+02:00',
    })
    expect(res.statusCode).toBe(200)
    expect(await eventsOf(ctx, id)).toHaveLength(before)

    const empty = await patch(ctx, id, {})
    expect(empty.statusCode).toBe(200)
    expect(await eventsOf(ctx, id)).toHaveLength(before)
  })

  it('sets completed_at when the status becomes done and clears it when it leaves done', async () => {
    const ctx = await setup()
    const projectId = await createProject(ctx, 'P')
    const id = await createTask(ctx, projectId, 'x')

    const done = await patch(ctx, id, { status: 'done' })
    expect(done.json().completedAt).toEqual(expect.any(String))
    expect((await rowOf(ctx, id)).completed_at).not.toBeNull()

    // Patching other fields while done must not move the completion time.
    const stamp = done.json().completedAt
    expect((await patch(ctx, id, { notes: 'n' })).json().completedAt).toBe(stamp)

    const reopened = await patch(ctx, id, { status: 'todo' })
    expect(reopened.json().completedAt).toBeNull()
    expect((await rowOf(ctx, id)).completed_at).toBeNull()
  })

  // A parent's status is set independently and never cascades to or from its children:
  // forcing them to agree breaks down as soon as the parent itself carries work.
  it('marking a parent done leaves its children untouched', async () => {
    const ctx = await setup()
    const projectId = await createProject(ctx, 'P')
    const parentId = await createTask(ctx, projectId, 'parent')
    const childId = await createTask(ctx, projectId, 'child', parentId)
    await patch(ctx, parentId, { status: 'done' })
    expect((await rowOf(ctx, childId)).status).toBe('todo')
    expect(await eventsOf(ctx, childId).then((e) => e.map((x) => x.type))).toEqual(['created'])
  })

  it('marking every child done leaves the parent status unchanged', async () => {
    const ctx = await setup()
    const projectId = await createProject(ctx, 'P')
    const parentId = await createTask(ctx, projectId, 'parent')
    const c1 = await createTask(ctx, projectId, 'c1', parentId)
    const c2 = await createTask(ctx, projectId, 'c2', parentId)
    await patch(ctx, c1, { status: 'done' })
    await patch(ctx, c2, { status: 'done' })
    expect((await rowOf(ctx, parentId)).status).toBe('todo')
    expect(await eventsOf(ctx, parentId).then((e) => e.map((x) => x.type))).toEqual(['created'])
  })
})

/**
 * ONE TASK, BY ITS ID: what a link to a task needs to find where the task lives. A task has no page
 * of its own, so its address is its project's page with the task's sheet open over it -- and a
 * link that knows only the task's id has to be able to ask which project that is.
 */
describe('read one', () => {
  it('answers with the task, its project included', async () => {
    const ctx = await setup()
    const projectId = await createProject(ctx, 'p')
    const id = await createTask(ctx, projectId, '一条')
    const res = await ctx.app.inject({
      method: 'GET',
      url: `/api/v1/tasks/${id}`,
      headers: ctx.authed,
    })
    expect(res.statusCode, res.body).toBe(200)
    expect(res.json()).toMatchObject({ id, projectId, title: '一条' })
  })

  it('does not find a deleted task, or one that never existed', async () => {
    const ctx = await setup()
    const projectId = await createProject(ctx, 'p')
    const id = await createTask(ctx, projectId, 'gone')
    expect((await del(ctx, id)).statusCode).toBe(204)
    for (const at of [id, randomUUID()]) {
      const res = await ctx.app.inject({
        method: 'GET',
        url: `/api/v1/tasks/${at}`,
        headers: ctx.authed,
      })
      expect(res.statusCode).toBe(404)
    }
  })

  it('does not find another workspace’s task', async () => {
    const a = await setup()
    const id = await createTask(a, await createProject(a, 'mine'), 'not yours')
    const res = await a.app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      headers,
      payload: { email: 'reader@example.com', password: 'correct horse battery', timezone: 'UTC' },
    })
    const other = { ...headers, cookie: String(res.headers['set-cookie']).split(';')[0]! }
    expect(
      (await a.app.inject({ method: 'GET', url: `/api/v1/tasks/${id}`, headers: other }))
        .statusCode,
    ).toBe(404)
  })
})

describe('delete', () => {
  // Checked through the two things "stops being listed" rests on: the deleted_at column and the
  // task becoming unaddressable.
  it('soft-deletes a task: row kept, flagged, and no longer addressable', async () => {
    const ctx = await setup()
    const projectId = await createProject(ctx, 'P')
    const id = await createTask(ctx, projectId, 'x')
    expect((await del(ctx, id)).statusCode).toBe(204)
    expect((await rowOf(ctx, id)).deleted_at).not.toBeNull()
    expect((await patch(ctx, id, { title: 'y' })).statusCode).toBe(404)
    expect((await del(ctx, id)).statusCode).toBe(404)
    expect((await eventsOf(ctx, id)).map((e) => e.type)).toEqual(['created', 'deleted'])
  })

  it('soft-deleting a parent soft-deletes its descendants too', async () => {
    const ctx = await setup()
    const projectId = await createProject(ctx, 'P')
    const [root, child, grandchild] = await createChain(ctx, projectId, 3)
    const sibling = await createTask(ctx, projectId, 'sibling')

    expect((await del(ctx, root!)).statusCode).toBe(204)

    expect((await rowOf(ctx, child!)).deleted_at).not.toBeNull()
    expect((await rowOf(ctx, grandchild!)).deleted_at).not.toBeNull()
    expect((await rowOf(ctx, sibling)).deleted_at).toBeNull()
    expect((await patch(ctx, grandchild!, { title: 'y' })).statusCode).toBe(404)
    expect(await eventsOf(ctx, child!).then((e) => e.map((x) => x.type))).toEqual([
      'created',
      'deleted',
    ])
  })

  it('records the task deleted by an upper-case id as deleted itself, not by cascade', async () => {
    const ctx = await setup()
    const projectId = await createProject(ctx, 'P')
    const [root, child] = await createChain(ctx, projectId, 2)

    expect((await del(ctx, root!.toUpperCase())).statusCode).toBe(204)

    expect((await eventsOf(ctx, root!)).at(-1)).toEqual({ type: 'deleted', payload: {} })
    expect((await eventsOf(ctx, child!)).at(-1)).toEqual({
      type: 'deleted',
      payload: { cascadedFrom: root },
    })
  })
})

describe('depth limit', () => {
  // The depth limit must be enforced on create as well as move, or a shallow
  // tree can be built and then moved into a deep one.
  it('allows a chain exactly MAX_TASK_DEPTH deep', async () => {
    const ctx = await setup()
    const projectId = await createProject(ctx, 'P')
    const chain = await createChain(ctx, projectId, 10)
    expect(chain).toHaveLength(10)
  })

  it('refuses to create a child one level beyond MAX_TASK_DEPTH', async () => {
    const ctx = await setup()
    const projectId = await createProject(ctx, 'P')
    const chain = await createChain(ctx, projectId, 10)
    const res = await post(ctx, { projectId, parentId: chain[9], title: 'too deep' })
    expect(res.statusCode).toBe(409)
    expect(res.json().title).toBe('Conflict')

    const count = await ctx.db.execute(sql`select count(*)::int as n from tasks`)
    expect((count.rows[0] as { n: number }).n).toBe(10)
  })

  it('counts depth from the root, so a sibling branch is unaffected', async () => {
    const ctx = await setup()
    const projectId = await createProject(ctx, 'P')
    const chain = await createChain(ctx, projectId, 10)
    // Depth 9 parent -> child lands at 10, which is allowed.
    const res = await post(ctx, { projectId, parentId: chain[8], title: 'side branch' })
    expect(res.statusCode).toBe(201)
  })
})

describe('workspace isolation', () => {
  async function secondUser(ctx: Harness) {
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      headers,
      payload: { email: 'other@example.com', password: 'correct horse battery', timezone: 'UTC' },
    })
    return { ...headers, cookie: String(res.headers['set-cookie']).split(';')[0]! }
  }

  it('cannot create a task in another workspace project', async () => {
    const a = await setup()
    const projectId = await createProject(a, 'mine')
    const bAuthed = await secondUser(a)
    const res = await a.app.inject({
      method: 'POST',
      url: '/api/v1/tasks',
      headers: bAuthed,
      payload: { projectId, title: 'planted' },
    })
    expect(res.statusCode).toBe(404)
  })

  it('cannot create a child under another workspace task', async () => {
    const a = await setup()
    const projectId = await createProject(a, 'mine')
    const parentId = await createTask(a, projectId, 'parent')
    const bAuthed = await secondUser(a)
    const bProject = (
      await a.app.inject({
        method: 'POST',
        url: '/api/v1/projects',
        headers: bAuthed,
        payload: { name: 'theirs' },
      })
    ).json().id
    const res = await a.app.inject({
      method: 'POST',
      url: '/api/v1/tasks',
      headers: bAuthed,
      payload: { projectId: bProject, parentId, title: 'planted' },
    })
    expect(res.statusCode).toBe(404)
  })

  it('cannot create a task under its own parent while naming another workspace project', async () => {
    const a = await setup()
    const projectId = await createProject(a, 'mine')
    const parentId = await createTask(a, projectId, 'parent')
    const bAuthed = await secondUser(a)
    const bProject = (
      await a.app.inject({
        method: 'POST',
        url: '/api/v1/projects',
        headers: bAuthed,
        payload: { name: 'theirs' },
      })
    ).json().id

    // The parent is legitimately ours and its project is what would be stored, so this is about
    // the request being coherent, not about leaking anything: `move` 404s the same pair.
    const res = await post(a, { projectId: bProject, parentId, title: 'child' })
    expect(res.statusCode).toBe(404)
  })

  it('cannot patch or delete another workspace task', async () => {
    const a = await setup()
    const projectId = await createProject(a, 'mine')
    const id = await createTask(a, projectId, 'mine')
    const bAuthed = await secondUser(a)

    const patched = await a.app.inject({
      method: 'PATCH',
      url: `/api/v1/tasks/${id}`,
      headers: bAuthed,
      payload: { title: 'stolen' },
    })
    expect(patched.statusCode).toBe(404)
    const deleted = await a.app.inject({
      method: 'DELETE',
      url: `/api/v1/tasks/${id}`,
      headers: bAuthed,
    })
    expect(deleted.statusCode).toBe(404)

    expect((await rowOf(a, id)).deleted_at).toBeNull()
    expect((await patch(a, id, {})).json().title).toBe('mine')
  })
})

describe('guards that must not be silently dropped', () => {
  it('a cascade does not touch or re-log a child that was already deleted', async () => {
    const ctx = await setup()
    const projectId = await createProject(ctx, 'P')
    const parentId = await createTask(ctx, projectId, 'parent')
    const childId = await createTask(ctx, projectId, 'child', parentId)
    await del(ctx, childId)
    const first = (await rowOf(ctx, childId)).deleted_at
    expect(first).toEqual(expect.any(String))

    await del(ctx, parentId)

    expect((await rowOf(ctx, childId)).deleted_at).toEqual(first)
    expect((await eventsOf(ctx, childId)).filter((e) => e.type === 'deleted')).toHaveLength(1)
  })

  it('a no-op patch of notes and scheduledOn logs nothing and keeps updated_at', async () => {
    const ctx = await setup()
    const projectId = await createProject(ctx, 'P')
    const id = await createTask(ctx, projectId, 'x')
    const same = { notes: 'n', scheduledOn: '2026-10-14' }
    await patch(ctx, id, same)
    const before = (await eventsOf(ctx, id)).length
    expect(before).toBe(3)

    const stamp = (await patch(ctx, id, {})).json().updatedAt

    expect((await patch(ctx, id, same)).statusCode).toBe(200)
    expect(await eventsOf(ctx, id)).toHaveLength(before)
    expect((await patch(ctx, id, {})).json().updatedAt).toBe(stamp)
  })

  it('sets completed_at on a task created as done', async () => {
    const ctx = await setup()
    const projectId = await createProject(ctx, 'P')
    const res = await post(ctx, { projectId, title: 'x', status: 'done' })
    expect(res.json().completedAt).toEqual(expect.any(String))
  })

  // A create or a cascading delete without the tree lock is invisible to a concurrent cascade.
  it('creating a task contends on the workspace-keyed tree lock', async () => {
    const ctx = await setup()
    const projectId = await createProject(ctx, 'P')
    const parentId = await createTask(ctx, projectId, 'parent')

    const res = await expectBlockedByTreeLock(ctx, () =>
      post(ctx, { projectId, parentId, title: 'child' }),
    )
    expect(res.statusCode).toBe(201)
    expect(res.json().parentId).toBe(parentId)
  })

  it('deleting a task contends on the workspace-keyed tree lock', async () => {
    const ctx = await setup()
    const projectId = await createProject(ctx, 'P')
    const parentId = await createTask(ctx, projectId, 'parent')
    const childId = await createTask(ctx, projectId, 'child', parentId)

    const res = await expectBlockedByTreeLock(ctx, () => del(ctx, parentId))
    expect(res.statusCode).toBe(204)
    expect((await rowOf(ctx, childId)).deleted_at).toEqual(expect.any(String))
  })

  it('treats tasks in a soft-deleted project as not found', async () => {
    const ctx = await setup()
    const projectId = await createProject(ctx, 'P')
    const id = await createTask(ctx, projectId, 'x')
    const gone = await ctx.app.inject({
      method: 'DELETE',
      url: `/api/v1/projects/${projectId}`,
      headers: ctx.authed,
    })
    expect(gone.statusCode).toBe(204)
    expect((await patch(ctx, id, { title: 'y' })).statusCode).toBe(404)
    expect((await post(ctx, { projectId, title: 'new' })).statusCode).toBe(404)
  })
})

/**
 * The event and the change it describes are one transaction.
 *
 * Two tests, pointing in OPPOSITE directions, because either alone is passed by an implementation
 * that writes the event after the commit:
 *
 * 1. A deferred trigger fails the transaction at COMMIT -- after every statement in it has run.
 *    An event written outside would be committed independently and survive.
 * 2. The EVENT INSERT ITSELF fails. This is the direction the first one cannot see: an
 *    append-after-commit implementation has already committed the task change by then, so the
 *    change survives a failed event. Inside one transaction, the change goes with it.
 */
describe('event and mutation share one transaction', () => {
  async function failAtCommit(ctx: Harness) {
    await ctx.db.execute(
      sql.raw(`
        create function force_fail() returns trigger language plpgsql as
          $$ begin raise exception 'forced commit failure'; end $$
      `),
    )
    await ctx.db.execute(
      sql.raw(`
        create constraint trigger force_fail after update on tasks
          deferrable initially deferred for each row execute function force_fail()
      `),
    )
  }

  it('rolls back the event when the update fails at commit', async () => {
    const ctx = await setup()
    const projectId = await createProject(ctx, 'P')
    const id = await createTask(ctx, projectId, 'x')
    await failAtCommit(ctx)

    // Not 'todo': that is what a task is created with, and a PATCH to the status it already
    // has changes nothing, so there would be no write for the commit to fail on.
    const res = await patch(ctx, id, { status: 'in_progress' })
    expect(res.statusCode).toBe(500)

    expect((await rowOf(ctx, id)).status).toBe('todo')
    expect((await eventsOf(ctx, id)).map((e) => e.type)).toEqual(['created'])
  })

  it('rolls back the CHANGE when writing its event fails', async () => {
    const ctx = await setup()
    const projectId = await createProject(ctx, 'P')
    const id = await createTask(ctx, projectId, 'before')
    // Fails the moment a title_changed event is inserted -- an ordinary immediate trigger, so it
    // raises DURING the mutation's transaction rather than at commit.
    await ctx.db.execute(
      sql.raw(`
        create function refuse_event() returns trigger language plpgsql as
          $$ begin raise exception 'forced event failure'; end $$
      `),
    )
    await ctx.db.execute(
      sql.raw(`
        create trigger refuse_event before insert on task_events for each row
          when (new.type = 'title_changed') execute function refuse_event()
      `),
    )

    expect((await patch(ctx, id, { title: 'after' })).statusCode).toBe(500)

    // THE TITLE DID NOT CHANGE. If the event were appended after the commit, the rename would
    // already be durable and this would read 'after' with no event to show for it.
    const titles = await ctx.db.execute(sql`select title from tasks where id = ${id}`)
    expect(titles.rows[0]).toMatchObject({ title: 'before' })
    expect((await eventsOf(ctx, id)).map((e) => e.type)).toEqual(['created'])
  })

  it('rolls back the deleted events when the cascade fails at commit', async () => {
    const ctx = await setup()
    const projectId = await createProject(ctx, 'P')
    const [root, child] = await createChain(ctx, projectId, 2)
    await failAtCommit(ctx)

    expect((await del(ctx, root!)).statusCode).toBe(500)

    expect((await rowOf(ctx, child!)).deleted_at).toBeNull()
    expect((await eventsOf(ctx, root!)).map((e) => e.type)).toEqual(['created'])
    expect((await eventsOf(ctx, child!)).map((e) => e.type)).toEqual(['created'])
  })
})

/**
 * The guard is in the command, not only in the route.
 *
 * Every cross-workspace test above goes through HTTP, so all of them pass against an app whose
 * only check is a route preHandler, while what matters is that a guard cannot be skipped by
 * reaching the work another way (a script, a job, a second route).
 *
 * So these call the commands directly with a workspace id that does not own the task.
 * They do not assert WHERE the check lives -- that would pin an implementation detail and get in
 * the way of honest refactoring -- only that the work itself refuses, whoever asks.
 */
describe('a write refuses a foreign workspace without going through a route', () => {
  it('refuses update, move and delete, and leaves the row untouched', async () => {
    const ctx = await setup()
    const projectId = await createProject(ctx, 'mine')
    const id = await createTask(ctx, projectId, 'mine')
    const sibling = await createTask(ctx, projectId, 'sibling')
    // A workspace that exists nowhere: the point is the task is not THIS caller's to touch.
    const stranger = { workspaceId: '99999999-9999-4999-8999-999999999999' }

    await expect(updateTask(ctx.db, stranger, id, { title: 'stolen' })).rejects.toThrow(
      TaskNotFoundError,
    )
    await expect(moveTask(ctx.db, stranger, id, { projectId, parentId: sibling })).rejects.toThrow(
      TaskNotFoundError,
    )
    await expect(softDeleteTask(ctx.db, stranger, id)).rejects.toThrow(TaskNotFoundError)

    // Nothing moved, nothing was flagged, and no event was logged against any of it.
    expect(await rowOf(ctx, id)).toMatchObject({ parent_id: null, deleted_at: null })
    const titles = await ctx.db.execute(sql`select title from tasks where id = ${id}`)
    expect(titles.rows[0]).toMatchObject({ title: 'mine' })
    expect((await eventsOf(ctx, id)).map((e) => e.type)).toEqual(['created'])
  })
})
