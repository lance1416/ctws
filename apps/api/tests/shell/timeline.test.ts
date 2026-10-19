import { afterEach, describe, expect, it } from 'vitest'
import { createProject, createTask } from '../helpers/builders'
import { appWithUser, type Harness, secondUser } from '../helpers/harness'

/**
 * A THING'S TIMELINE (FR-044, FR-045): its own changes, newest first, read through the shell so
 * every kind of thing answers the same way. Other kinds of entry (messages, meetings, notes) join
 * as their modules arrive; this file covers the log itself and the page.
 */
const cleanups: (() => Promise<void>)[] = []
afterEach(async () => {
  for (const stop of cleanups.splice(0)) await stop()
})

type Entry = { kind: string; at: string; event: { type: string; payload: unknown } }

async function timeline(ctx: Harness, type: string, id: string, extra = '') {
  const res = await ctx.app.inject({
    method: 'GET',
    url: `/api/v1/timeline?type=${type}&id=${id}${extra}`,
    headers: ctx.authed,
  })
  return {
    status: res.statusCode,
    body: res.json() as { entries: Entry[]; page: { nextCursor: string | null } },
  }
}

describe('GET /timeline', () => {
  it("lists a task's changes newest first, with the old and new values", async () => {
    const ctx = await appWithUser()
    cleanups.push(ctx.stop)
    const project = await createProject(ctx, 'P')
    const task = await createTask(ctx, project, 'Write the RFC')
    const res = await ctx.app.inject({
      method: 'PATCH',
      url: `/api/v1/tasks/${task}`,
      headers: ctx.authed,
      payload: { dueAt: '2026-10-24T18:00:00+00:00' },
    })
    expect(res.statusCode, res.body).toBe(200)

    const { status, body } = await timeline(ctx, 'task', task)
    expect(status).toBe(200)
    expect(body.entries.map((e) => [e.kind, e.event.type])).toEqual([
      ['change', 'due_changed'],
      ['change', 'created'],
    ])
    expect(body.entries[0]?.event.payload).toEqual({
      from: null,
      to: '2026-10-24T18:00:00.000Z',
    })
    expect(body.page.nextCursor).toBeNull()
  })

  it('reads a page at a time', async () => {
    const ctx = await appWithUser()
    cleanups.push(ctx.stop)
    const project = await createProject(ctx, 'P')
    const task = await createTask(ctx, project, 'a')
    for (const title of ['b', 'c', 'd']) {
      await ctx.app.inject({
        method: 'PATCH',
        url: `/api/v1/tasks/${task}`,
        headers: ctx.authed,
        payload: { title },
      })
    }
    const first = await timeline(ctx, 'task', task, '&limit=3')
    expect(first.body.entries).toHaveLength(3)
    expect(first.body.page.nextCursor).not.toBeNull()
    const rest = await timeline(ctx, 'task', task, `&limit=3&cursor=${first.body.page.nextCursor}`)
    expect(rest.body.entries.map((e) => e.event.type)).toEqual(['created'])
    expect(rest.body.page.nextCursor).toBeNull()
  })

  it("refuses another workspace's thing as not found", async () => {
    const ctx = await appWithUser()
    cleanups.push(ctx.stop)
    const project = await createProject(ctx, 'P')
    const task = await createTask(ctx, project, 'mine')
    const other = await secondUser(ctx)
    expect((await timeline(other, 'task', task)).status).toBe(404)
  })

  it('refuses a kind of entry it does not know', async () => {
    const ctx = await appWithUser()
    cleanups.push(ctx.stop)
    const project = await createProject(ctx, 'P')
    const task = await createTask(ctx, project, 'mine')
    expect((await timeline(ctx, 'task', task, '&kinds=gossip')).status).toBe(400)
  })
})
