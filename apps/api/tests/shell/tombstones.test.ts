import type { TombstoneResponse } from '@ctws/contracts'
import { sql } from 'drizzle-orm'
import { afterEach, describe, expect, it } from 'vitest'
import {
  createChain,
  createMeeting,
  createPerson,
  createProject,
  createTask,
} from '../helpers/builders'
import { setupWith, type Harness, secondUser, web } from '../helpers/harness'

/**
 * DELETING FOR GOOD (FR-035, STORY-008): the row goes, with its log, relations and resources, and
 * a tombstone stays so the old address can say what it was, when it went and where it was.
 */
const cleanups: (() => Promise<void>)[] = []
const setup = () => setupWith(cleanups)
afterEach(async () => {
  for (const stop of cleanups.splice(0)) await stop()
})

const del = (ctx: Harness, url: string) =>
  ctx.app.inject({ method: 'DELETE', url: `/api/v1${url}`, headers: web(ctx) })

async function tombstone(ctx: Harness, type: string, id: string) {
  const res = await ctx.app.inject({
    method: 'GET',
    url: `/api/v1/tombstones/${type}/${id}`,
    headers: web(ctx),
  })
  return { status: res.statusCode, body: res.json() as TombstoneResponse }
}

const countOf = async (ctx: Harness, where: string) =>
  Number(
    (
      (await ctx.db.execute(sql.raw(`select count(*)::int as n from ${where}`))).rows[0] as {
        n: number
      }
    ).n,
  )

describe('a deleted task', () => {
  it('is gone with its subtree, and each node leaves a tombstone that says where it was', async () => {
    const ctx = await setup()
    const project = await createProject(ctx, 'Job hunt')
    const [root, child, grandchild] = await createChain(ctx, project, 3)
    const sibling = await createTask(ctx, project, 'sibling')
    await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/resources',
      headers: web(ctx),
      payload: { owner: { type: 'task', id: child }, url: 'https://example.com/brief' },
    })

    expect((await del(ctx, `/tasks/${child}`)).statusCode).toBe(204)

    // The rows are gone, not flagged; so is what the shell kept about them.
    expect(await countOf(ctx, `tasks where id in ('${child}', '${grandchild}')`)).toBe(0)
    expect(await countOf(ctx, `events where object_id in ('${child}', '${grandchild}')`)).toBe(0)
    expect(await countOf(ctx, `resources where owner_id = '${child}'`)).toBe(0)
    expect(await countOf(ctx, `tasks where id in ('${root}', '${sibling}')`)).toBe(2)

    const gone = await tombstone(ctx, 'task', child!)
    expect(gone.status).toBe(200)
    expect(gone.body).toMatchObject({
      type: 'task',
      id: child,
      title: 'n1',
      place: {
        projectId: project,
        projectName: 'Job hunt',
        parentType: 'task',
        parentId: root,
        path: ['n0'],
      },
    })
    // The grandchild's path runs through the task deleted with it, which was still above it.
    expect((await tombstone(ctx, 'task', grandchild!)).body.place).toMatchObject({
      parentId: child,
      path: ['n0', 'n1'],
    })
    // The old address is a 404; the tombstone is what it asks next.
    const read = await ctx.app.inject({
      method: 'GET',
      url: `/api/v1/tasks/${child}`,
      headers: web(ctx),
    })
    expect(read.statusCode).toBe(404)
  })
})

describe('a deleted project', () => {
  it('takes its tasks with it, each with a tombstone, and unfiles what other modules kept in it', async () => {
    const ctx = await setup()
    const project = await createProject(ctx, 'Moving')
    const [root, child] = await createChain(ctx, project, 2)
    const meeting = await createMeeting(ctx, {
      title: 'Viewing',
      startsLocal: '2026-10-21T10:00',
      timeZone: 'Europe/London',
      durationMinutes: 30,
      projectId: project,
    })

    expect((await del(ctx, `/projects/${project}`)).statusCode).toBe(204)

    expect(await countOf(ctx, `projects where id = '${project}'`)).toBe(0)
    expect(await countOf(ctx, `tasks where project_id = '${project}'`)).toBe(0)
    expect((await tombstone(ctx, 'project', project)).body).toMatchObject({ title: 'Moving' })
    expect((await tombstone(ctx, 'task', child!)).body.place).toMatchObject({
      projectName: 'Moving',
      parentId: root,
    })
    // Having met about something is history; the meeting stays, filed nowhere.
    const kept = await ctx.app.inject({
      method: 'GET',
      url: `/api/v1/meetings/${meeting.meetingId}`,
      headers: web(ctx),
    })
    expect(kept.statusCode).toBe(200)
    expect(kept.json()).toMatchObject({ projectId: null, projectName: null })
  })

  it('refuses the inbox, as before', async () => {
    const ctx = await setup()
    const list = await ctx.app.inject({ method: 'GET', url: '/api/v1/projects', headers: web(ctx) })
    const inbox = (list.json().projects as { id: string; isInbox: boolean }[]).find(
      (p) => p.isInbox,
    )!
    expect((await del(ctx, `/projects/${inbox.id}`)).statusCode).toBe(409)
  })
})

describe('a deleted person', () => {
  it('leaves a tombstone, drops out of meetings, and cannot be deleted twice', async () => {
    const ctx = await setup()
    const person = await createPerson(ctx, { name: '陈颖' })
    const meeting = await createMeeting(ctx, {
      title: '二面',
      startsLocal: '2026-10-20T21:00',
      timeZone: 'America/Toronto',
      durationMinutes: 60,
      attendeeIds: [person.id],
    })

    expect((await del(ctx, `/people/${person.id}`)).statusCode).toBe(204)
    expect((await del(ctx, `/people/${person.id}`)).statusCode).toBe(404)
    expect((await tombstone(ctx, 'person', person.id)).body).toMatchObject({ title: '陈颖' })
    const read = await ctx.app.inject({
      method: 'GET',
      url: `/api/v1/meetings/${meeting.meetingId}`,
      headers: web(ctx),
    })
    expect(read.json().attendees).toEqual([])
  })
})

describe('a deleted person who was the only party of a message', () => {
  it('leaves the message readable, with nobody on it', async () => {
    const ctx = await setup()
    const person = await createPerson(ctx, { name: '陈颖' })
    const logged = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/communication',
      headers: web(ctx),
      payload: {
        direction: 'sent',
        channel: 'email',
        parties: [{ type: 'person', id: person.id }],
        subject: 'Hello',
      },
    })
    expect(logged.statusCode, logged.body).toBe(201)
    expect((await del(ctx, `/people/${person.id}`)).statusCode).toBe(204)
    const read = await ctx.app.inject({
      method: 'GET',
      url: `/api/v1/communication/${(logged.json() as { id: string }).id}`,
      headers: web(ctx),
    })
    expect(read.statusCode, read.body).toBe(200)
    expect(read.json().parties).toEqual([])
  })
})

describe('asking for a tombstone', () => {
  it("is a 404 for a thing that was never deleted, or another workspace's", async () => {
    const ctx = await setup()
    const person = await createPerson(ctx, { name: '在' })
    expect((await tombstone(ctx, 'person', person.id)).status).toBe(404)

    const theirs = await secondUser(ctx, 'theirs@example.com')
    const stranger = await createPerson(theirs, { name: '别人' })
    await del(theirs, `/people/${stranger.id}`)
    expect((await tombstone(theirs, 'person', stranger.id)).status).toBe(200)
    expect((await tombstone(ctx, 'person', stranger.id)).status).toBe(404)
  })
})
