import { afterEach, describe, expect, it } from 'vitest'
import {
  createMeeting,
  createPerson,
  createProject,
  createReading,
  createTask,
} from '../helpers/builders'
import { setupWith, type Harness } from '../helpers/harness'

/**
 * WHAT EACH THING READS BACK AS, FIELD FOR FIELD.
 *
 * A response schema drops what it does not name, so a field the server means to send and the
 * contract forgot would vanish without an error. Each read here is compared whole: a field lost
 * on the way, or one that appears unannounced, fails the comparison.
 */

const cleanups: (() => Promise<void>)[] = []
afterEach(async () => {
  while (cleanups.length) await cleanups.pop()!()
})

const ID = expect.stringMatching(/^[0-9a-f-]{36}$/)
const AT = expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)

async function read(ctx: Harness, url: string): Promise<unknown> {
  const res = await ctx.app.inject({ method: 'GET', url, headers: ctx.authed })
  expect(res.statusCode, res.body).toBe(200)
  return res.json()
}

describe('a read answers with exactly the fields its contract names', () => {
  it('a project in the list', async () => {
    const ctx = await setupWith(cleanups)
    const id = await createProject(ctx, 'Garden')
    const { projects } = (await read(ctx, '/api/v1/projects')) as { projects: { id: string }[] }
    expect(projects.find((p) => p.id === id)).toEqual({
      id,
      workspaceId: ID,
      name: 'Garden',
      color: expect.stringMatching(/^[a-z]+$/),
      initials: 'GA',
      isInbox: false,
      rank: expect.any(String),
      archivedAt: null,
      createdAt: AT,
      columns: { openTasks: 0, parentTasks: 0 },
      stages: [],
    })
  })

  it('a project as a write answers it, counted as a read counts it', async () => {
    const ctx = await setupWith(cleanups)
    const id = await createProject(ctx, 'Garden')
    await createTask(ctx, id, 'Water')
    const res = await ctx.app.inject({
      method: 'PATCH',
      url: `/api/v1/projects/${id}`,
      headers: ctx.authed,
      payload: { name: 'Allotment' },
    })
    expect(res.statusCode, res.body).toBe(200)
    expect(res.json()).toEqual(await read(ctx, `/api/v1/projects/${id}`))
    expect(res.json()).toMatchObject({ name: 'Allotment', columns: { openTasks: 1 } })
  })

  it('a task', async () => {
    const ctx = await setupWith(cleanups)
    const projectId = await createProject(ctx)
    const id = await createTask(ctx, projectId, 'Water', undefined, { scheduledOn: '2026-10-20' })
    expect(await read(ctx, `/api/v1/tasks/${id}`)).toEqual({
      id,
      projectId,
      parentId: null,
      title: 'Water',
      notes: null,
      status: 'todo',
      scheduledOn: '2026-10-20',
      dueAt: null,
      rank: expect.any(String),
      stageId: null,
      stageSince: null,
      completedAt: null,
      createdAt: AT,
      updatedAt: AT,
    })
  })

  it('a task as a search finds it', async () => {
    const ctx = await setupWith(cleanups)
    const projectId = await createProject(ctx, 'Garden')
    const id = await createTask(ctx, projectId, 'Water the beans', undefined, { notes: 'Daily.' })
    const { tasks } = (await read(ctx, '/api/v1/tasks?q=beans')) as { tasks: unknown[] }
    expect(tasks).toEqual([
      {
        id,
        projectId,
        parentId: null,
        title: 'Water the beans',
        status: 'todo',
        scheduledOn: null,
        dueAt: null,
        rank: expect.any(String),
        stageId: null,
        stageSince: null,
        completedAt: null,
        createdAt: AT,
        updatedAt: AT,
        projectName: 'Garden',
        parentTitle: null,
        projectArchived: false,
      },
    ])
  })

  it('a person', async () => {
    const ctx = await setupWith(cleanups)
    const projectId = await createProject(ctx, 'Work')
    const { id } = await createPerson(ctx, {
      name: 'Ying',
      org: 'Acme',
      projectIds: [projectId],
      channels: [{ kind: 'email', value: 'ying@example.com', label: 'work' }],
    })
    expect(await read(ctx, `/api/v1/people/${id}`)).toEqual({
      id,
      name: 'Ying',
      org: 'Acme',
      note: null,
      projects: [{ id: projectId, name: 'Work' }],
      channels: [{ kind: 'email', value: 'ying@example.com', label: 'work' }],
      birthday: null,
      gender: null,
      hometown: null,
      city: null,
      givenName: expect.any(String),
      middleName: null,
      familyName: null,
      sortKey: expect.any(String),
      aliases: [],
      circleIds: [],
      timeZone: null,
      timeZoneSource: null,
      cityKey: null,
      hometownKey: null,
      title: null,
      circle: null,
      roles: [],
      createdAt: AT,
      updatedAt: AT,
    })
  })

  it('a meeting occurrence', async () => {
    const ctx = await setupWith(cleanups)
    const projectId = await createProject(ctx, 'Work')
    const person = await createPerson(ctx, { name: 'Ying' })
    const made = await createMeeting(ctx, { projectId, attendeeIds: [person.id] })
    expect(
      await read(ctx, `/api/v1/meetings/${made.meetingId}/occurrences/2026-03-02T09:00`),
    ).toEqual({
      meetingId: made.meetingId,
      recurrenceId: '2026-03-02T09:00',
      title: 'Standup',
      startsLocal: '2026-03-02T09:00',
      timeZone: 'UTC',
      durationMinutes: 30,
      startsAt: '2026-03-02T09:00:00.000Z',
      endsAt: '2026-03-02T09:30:00.000Z',
      rrule: null,
      overridden: false,
      location: null,
      joinUrl: null,
      note: null,
      projectId,
      projectName: 'Work',
      attendees: [{ id: person.id, name: 'Ying' }],
    })
  })

  it('a reading item', async () => {
    const ctx = await setupWith(cleanups)
    const { id } = await createReading(ctx)
    expect(await read(ctx, `/api/v1/reading/${id}`)).toEqual({
      id,
      kind: 'book',
      title: 'Dune',
      url: null,
      author: null,
      status: 'todo',
      planOn: null,
      projectId: null,
      projectName: null,
      recommendedBy: null,
      fetchedTitle: null,
      fetchedSummary: null,
      statusSince: AT,
      createdAt: AT,
      updatedAt: AT,
    })
  })
})
