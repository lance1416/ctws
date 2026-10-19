import { OBJECT_TYPES, type CandidatesResponse, type LinksResponse } from '@ctws/contracts'
import { sql } from 'drizzle-orm'
import { afterEach, describe, expect, it } from 'vitest'
import { apiModules } from '../../src/modules'
import { linkRegistry } from '../../src/shell/links/registry'
import { projectLinkable } from '../../src/shell/projects/linkable'
import { setupWith, type Harness, web, secondUser } from '../helpers/harness'
import {
  createProject,
  createTask,
  createMeeting,
  createPerson,
  createReading,
} from '../helpers/builders'

/**
 * BACKLINKS -- open a thing, see everything it is connected to.
 *
 * The half of the edge table that a per-module column cannot do. Nothing is written on a person's
 * record when a meeting names them as a guest; one row says both facts, and this read is what
 * turns the second one into a page.
 */

const cleanups: (() => Promise<void>)[] = []

const setup = (email: string) => setupWith(cleanups, email)
afterEach(async () => {
  for (const stop of cleanups.splice(0)) await stop()
})

async function linksOf(
  ctx: Harness,
  type: string,
  id: string,
  types?: string,
): Promise<LinksResponse['groups']> {
  const res = await ctx.app.inject({
    method: 'GET',
    url: `/api/v1/links?type=${type}&id=${id}${types ? `&types=${types}` : ''}`,
    headers: web(ctx),
  })
  expect(res.statusCode, res.body).toBe(200)
  return (res.json() as LinksResponse).groups
}

const titles = (groups: LinksResponse['groups'], type: string) =>
  groups.find((g) => g.type === type)?.items.map((i) => i.title) ?? []

describe('every kind of thing has a module that answers for it', () => {
  const registry = linkRegistry([...apiModules({}).map((m) => m.linkable), projectLinkable])

  it('answers for every object type, in page order', () => {
    expect(registry.order).toEqual([
      'task',
      'meeting',
      'person',
      'organisation',
      'communication',
      'reading',
      'project',
    ])
    expect([...registry.order].sort()).toEqual([...OBJECT_TYPES].sort())
  })

  it('refuses a set that leaves a type unanswered', () => {
    expect(() => linkRegistry(registry.all.slice(1))).toThrow(/missing: task/)
  })

  it('refuses a set that answers for a type twice, and names it', () => {
    expect(() => linkRegistry([...registry.all, projectLinkable])).toThrow(/duplicated: project/)
  })
})

describe('opening a thing shows what it is connected to', () => {
  it('shows a person the meetings they are in, without anything written on their record', async () => {
    const ctx = await setup('back@example.com')
    const person = await createPerson(ctx, {
      name: '陈颖',
      org: 'Acme 招聘',
    })
    // The guest list is written on the MEETING. The person's record is untouched.
    for (const [title, startsLocal] of [
      ['二面', '2026-10-20T21:00'],
      ['一面', '2026-10-06T20:00'],
    ] as const) {
      await createMeeting(ctx, {
        title,
        startsLocal,
        timeZone: 'America/Toronto',
        durationMinutes: 60,
        attendeeIds: [person.id],
      })
    }

    const groups = await linksOf(ctx, 'person', person.id)
    expect(titles(groups, 'meeting')).toEqual(['一面', '二面'])
    const meetings = groups.find((g) => g.type === 'meeting')!
    // Read AGAINST the edge: the stored row says the MEETING has this person, and this is the
    // person's end of it.
    expect(meetings.items.every((i) => i.outgoing === false && i.kind === 'attends')).toBe(true)
    // Each series' own start, and the zone it was agreed in, for the page to say.
    expect(meetings.items).toMatchObject([
      { startsAt: '2026-10-07T00:00:00.000Z', timeZone: 'America/Toronto' },
      { startsAt: '2026-10-21T01:00:00.000Z', timeZone: 'America/Toronto' },
    ])
  })

  it('shows a project everything on it, tasks included, in one uniform set of edges', async () => {
    const ctx = await setup('project@example.com')
    const project = await createProject(ctx, '找工作')
    await createTask(ctx, project, '改简历')
    const person = await createPerson(ctx, {
      name: '陈颖',
      projectIds: [project],
    })
    const reading = await createReading(ctx, {
      kind: 'link',
      url: 'https://example.test/a',
    })
    const filed = await ctx.app.inject({
      method: 'PATCH',
      url: `/api/v1/reading/${reading.id}`,
      headers: web(ctx),
      payload: { title: '面试准备', projectId: project },
    })
    expect(filed.statusCode, filed.body).toBe(200)
    await createMeeting(ctx, {
      title: '二面',
      startsLocal: '2026-10-20T21:00',
      timeZone: 'America/Toronto',
      durationMinutes: 60,
      projectId: project,
      attendeeIds: [person.id],
    })

    const groups = await linksOf(ctx, 'project', project)
    // Groups come out in registry order, not in whatever order the edges were stored.
    expect(groups.map((g) => g.type)).toEqual(['task', 'meeting', 'person', 'reading'])
    // The task's project is still a COLUMN; the page cannot tell, which is the point.
    expect(titles(groups, 'task')).toEqual(['改简历'])
    expect(titles(groups, 'meeting')).toEqual(['二面'])
    expect(titles(groups, 'person')).toEqual(['陈颖'])
    expect(titles(groups, 'reading')).toEqual(['面试准备'])
  })

  it('lists only the kinds asked for, whether an edge is a row or a column', async () => {
    const ctx = await setup('kinds@example.com')
    const project = await createProject(ctx, '找工作')
    await createTask(ctx, project, '改简历')
    await createPerson(ctx, { name: '陈颖', projectIds: [project] })
    const groups = await linksOf(ctx, 'project', project, 'person,reading')
    expect(groups.map((g) => g.type)).toEqual(['person'])
    expect((await linksOf(ctx, 'project', project, 'task')).map((g) => g.type)).toEqual(['task'])
    const res = await ctx.app.inject({
      method: 'GET',
      url: `/api/v1/links?type=project&id=${project}&types=person,files`,
      headers: web(ctx),
    })
    expect(res.statusCode).toBe(400)
  })

  it('leaves out what was deleted, rather than drawing a row nobody can open', async () => {
    const ctx = await setup('gone@example.com')
    const person = await createPerson(ctx, { name: '陈颖' })
    const meeting = await createMeeting(ctx, {
      title: '二面',
      startsLocal: '2026-10-20T21:00',
      timeZone: 'America/Toronto',
      durationMinutes: 60,
      attendeeIds: [person.id],
    })
    expect(titles(await linksOf(ctx, 'person', person.id), 'meeting')).toEqual(['二面'])

    const dropped = await ctx.app.inject({
      method: 'DELETE',
      url: `/api/v1/meetings/${meeting.meetingId}`,
      headers: web(ctx),
    })
    expect(dropped.statusCode, dropped.body).toBe(204)
    expect(await linksOf(ctx, 'person', person.id)).toEqual([])
  })

  it('refuses a page for a thing this workspace cannot see', async () => {
    const ctx = await setup('mine2@example.com')
    const theirHeaders = (await secondUser(ctx, 'theirs2@example.com')).authed
    const myPerson = await createPerson(ctx, { name: '陈颖' })

    const reached = await ctx.app.inject({
      method: 'GET',
      url: `/api/v1/links?type=person&id=${myPerson.id}`,
      headers: theirHeaders,
    })
    expect(reached.statusCode, reached.body).toBe(404)
  })
})

describe('making and removing one edge by hand', () => {
  it('accepts a kind the model allows, and reads it back from both ends', async () => {
    const ctx = await setup('edge@example.com')
    const person = await createPerson(ctx, { name: '陈颖' })
    const reading = await createReading(ctx, {
      kind: 'book',
      title: '设计心理学',
    })

    const made = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/links',
      headers: web(ctx),
      payload: {
        from: { type: 'person', id: person.id },
        to: { type: 'reading', id: reading.id },
        kind: 'recommends',
      },
    })
    expect(made.statusCode, made.body).toBe(201)
    expect(made.headers.location).toBe(`/api/v1/links/${made.json().id}`)
    expect(made.json()).toMatchObject({
      from: { type: 'person', id: person.id },
      to: { type: 'reading', id: reading.id },
      kind: 'recommends',
    })

    // Asked again, it is the same link, said with a 200; and it reads at its Location.
    const again = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/links',
      headers: web(ctx),
      payload: {
        from: { type: 'person', id: person.id },
        to: { type: 'reading', id: reading.id },
        kind: 'recommends',
      },
    })
    expect(again.statusCode).toBe(200)
    expect(again.json()).toEqual(made.json())
    const read = await ctx.app.inject({
      method: 'GET',
      url: String(made.headers.location),
      headers: web(ctx),
    })
    expect(read.json()).toEqual(made.json())

    // "she recommended this book" and "this book was recommended by her" are one row, read twice.
    const theirs = await linksOf(ctx, 'person', person.id)
    expect(theirs.find((g) => g.type === 'reading')!.items[0]).toMatchObject({
      title: '设计心理学',
      kind: 'recommends',
      outgoing: true,
    })
    const books = await linksOf(ctx, 'reading', reading.id)
    expect(books.find((g) => g.type === 'person')!.items[0]).toMatchObject({
      title: '陈颖',
      kind: 'recommends',
      outgoing: false,
    })

    // One link, read from either end, with one id.
    expect(theirs.find((g) => g.type === 'reading')!.items[0]!.linkId).toBe(made.json().id)
    expect(books.find((g) => g.type === 'person')!.items[0]!.linkId).toBe(made.json().id)
    const removed = await ctx.app.inject({
      method: 'DELETE',
      url: `/api/v1/links/${made.json().id}`,
      headers: web(ctx),
    })
    expect(removed.statusCode, removed.body).toBe(204)
    expect(await linksOf(ctx, 'person', person.id)).toEqual([])
    // Gone is gone: the id no longer names anything.
    const twice = await ctx.app.inject({
      method: 'DELETE',
      url: `/api/v1/links/${made.json().id}`,
      headers: web(ctx),
    })
    expect(twice.statusCode).toBe(404)
  })

  it('refuses a kind the model does not allow, and an end that is not there', async () => {
    const ctx = await setup('bad@example.com')
    const person = await createPerson(ctx, { name: '陈颖' })
    const other = await createPerson(ctx, { name: '另一个人' })

    const make = (payload: Record<string, unknown>) =>
      ctx.app.inject({ method: 'POST', url: '/api/v1/links', headers: web(ctx), payload })

    // `recommends` runs from a person to something to read, never between two people.
    const wrongEnds = await make({
      from: { type: 'person', id: person.id },
      to: { type: 'person', id: other.id },
      kind: 'recommends',
    })
    expect(wrongEnds.statusCode).toBe(400)

    // A thing cannot be related to itself, whatever the kind.
    const itself = await make({
      from: { type: 'person', id: person.id },
      to: { type: 'person', id: person.id },
      kind: 'about',
    })
    expect(itself.statusCode).toBe(400)

    // The same id in upper case is still the same thing.
    const itselfShouting = await make({
      from: { type: 'person', id: person.id },
      to: { type: 'person', id: person.id.toUpperCase() },
      kind: 'about',
    })
    expect(itselfShouting.statusCode, itselfShouting.body).toBe(400)

    // An id of the right shape that names nothing is a 404, not a stored edge.
    const nowhere = await make({
      from: { type: 'person', id: person.id },
      to: { type: 'reading', id: '99999999-9999-4999-8999-999999999999' },
      kind: 'recommends',
    })
    expect(nowhere.statusCode).toBe(404)
  })

  it('refuses part of for a task, whose project is its own column, and for a project', async () => {
    const ctx = await setup('partof@example.com')
    const home = await createProject(ctx, '找工作')
    const other = await createProject(ctx, '搬家')
    const task = await createTask(ctx, home, '改简历')

    const make = (from: { type: string; id: string }) =>
      ctx.app.inject({
        method: 'POST',
        url: '/api/v1/links',
        headers: web(ctx),
        payload: { from, to: { type: 'project', id: other }, kind: 'belongs' },
      })
    expect((await make({ type: 'task', id: task })).statusCode).toBe(400)
    expect((await make({ type: 'project', id: home })).statusCode).toBe(400)
    expect((await linksOf(ctx, 'project', other)).map((g) => g.type)).toEqual([])
  })

  it('still removes a part of link stored before such links were refused', async () => {
    const ctx = await setup('stranded@example.com')
    const home = await createProject(ctx, '找工作')
    const other = await createProject(ctx, '搬家')
    const task = await createTask(ctx, home, '改简历')
    await ctx.db.execute(sql`
      insert into links (id, workspace_id, from_type, from_id, to_type, to_id, kind)
      select gen_random_uuid(), workspace_id, 'task', ${task}, 'project', ${other}, 'belongs'
      from projects where id = ${other}
    `)

    const [stranded] = (await linksOf(ctx, 'project', other)).find((g) => g.type === 'task')!.items
    const removed = await ctx.app.inject({
      method: 'DELETE',
      url: `/api/v1/links/${stranded!.linkId}`,
      headers: web(ctx),
    })
    expect(removed.statusCode, removed.body).toBe(204)
    expect((await linksOf(ctx, 'project', other)).map((g) => g.type)).toEqual([])
  })
})

/**
 * WHICH EDGES ARE THE SHELL'S TO REMOVE.
 *
 * An edge a module stores in a column of its own is not one: a task's project is NOT NULL, so
 * "unlink" on it would mean a task belonging to nothing, which that module does not allow. The
 * row still shows -- the page would otherwise lie about what the project holds -- and it says it
 * cannot be removed, which is what the interface reads to decide whether to draw the control.
 */
describe('an edge a module stores itself', () => {
  it('is reported but not removable, unlike one in the edge table', async () => {
    const ctx = await setup('own@example.com')
    const project = await createProject(ctx, '找工作')
    await createTask(ctx, project, '改简历')
    await createPerson(ctx, { name: '陈颖', projectIds: [project] })

    const groups = await linksOf(ctx, 'project', project)
    const task = groups.find((g) => g.type === 'task')!.items[0]!
    const person = groups.find((g) => g.type === 'person')!.items[0]!

    // The task's project is a column the task module keeps; the person's is a row in `links`.
    expect(task).toMatchObject({ title: '改简历', linkId: null })
    expect(person).toMatchObject({ title: '陈颖', linkId: expect.any(String) })
  })
})

/**
 * WHAT THE PICKER IS OFFERED, which is a server decision and not a UI one.
 *
 * The box the person types into shows four kinds of thing at once, and each one comes out of its
 * own module's table. Everything that keeps the list honest is decided here: which types may be
 * joined to the one being linked FROM, that the object itself is never offered, that another
 * workspace's rows are not, and that a deleted row is not.
 */
describe('what can go at the other end', () => {
  const candidatesFor = async (ctx: Harness, type: string, id: string, q = '') => {
    const res = await ctx.app.inject({
      method: 'GET',
      url: `/api/v1/links?view=candidates&type=${type}&id=${id}&q=${encodeURIComponent(q)}`,
      headers: web(ctx),
    })
    expect(res.statusCode, res.body).toBe(200)
    return (res.json() as CandidatesResponse).candidates
  }

  it('offers every kind the model allows, and never the object itself', async () => {
    const ctx = await setup('cand@example.com')
    const project = await createProject(ctx, '找工作')
    await createTask(ctx, project, '改简历')
    const person = await createPerson(ctx, { name: '陈颖' })
    const other = await createPerson(ctx, { name: '老王' })
    await createReading(ctx, { kind: 'book', title: '设计心理学' })
    await createMeeting(ctx, {
      title: '二面',
      startsLocal: '2026-10-20T21:00',
      timeZone: 'America/Toronto',
      durationMinutes: 60,
    })

    const offered = await candidatesFor(ctx, 'person', person.id)
    // One box, every kind of thing, each out of its own module's table.
    expect([...new Set(offered.map((c) => c.type))].sort()).toEqual([
      'meeting',
      'person',
      'project',
      'reading',
      'task',
    ])
    // The person being linked FROM is not in their own list; the other person is.
    expect(offered.filter((c) => c.id === person.id)).toEqual([])
    expect(offered.filter((c) => c.id === other.id)).toHaveLength(1)
    // A task carries the project it is in, so two tasks of the same name can be told apart.
    expect(offered.find((c) => c.type === 'task')).toMatchObject({
      title: '改简历',
      status: 'todo',
      projectName: '找工作',
    })
    // ...and a finished one says so, beside the project rather than instead of it.
    const done = await createTask(ctx, project, '投出去了')
    await ctx.app.inject({
      method: 'PATCH',
      url: `/api/v1/tasks/${done}`,
      headers: web(ctx),
      payload: { status: 'done' },
    })
    const after = await candidatesFor(ctx, 'person', person.id)
    expect(after.find((c) => c.id === done)).toMatchObject({
      status: 'done',
      projectName: '找工作',
    })
  })

  it('narrows to what was typed, across the modules at once', async () => {
    const ctx = await setup('candq@example.com')
    const person = await createPerson(ctx, { name: '陈颖' })
    await createReading(ctx, { kind: 'book', title: '设计心理学' })
    await createReading(ctx, { kind: 'book', title: '代码整洁之道' })
    await createProject(ctx, '设计系统')

    const found = await candidatesFor(ctx, 'person', person.id, '设计')
    expect(found.map((c) => [c.type, c.title]).sort()).toEqual([
      ['project', '设计系统'],
      ['reading', '设计心理学'],
    ])
    expect(found.some((c) => c.title === '代码整洁之道')).toBe(false)
    // And the wildcards are characters, not patterns: `_` would match any one character.
    expect(await candidatesFor(ctx, 'person', person.id, '设_系统')).toEqual([])
  })

  it('offers nothing from another workspace, and nothing deleted', async () => {
    const ctx = await setup('candiso@example.com')
    const mine = await createPerson(ctx, { name: '陈颖' })
    const doomed = await createPerson(ctx, { name: '要删掉的' })
    await ctx.app.inject({
      method: 'DELETE',
      url: `/api/v1/people/${doomed.id}`,
      headers: web(ctx),
    })

    // A second user in the SAME app, so the two workspaces really are rows in one database.
    const theirPerson = await createPerson(await secondUser(ctx, 'theirs@example.com'), {
      name: '别人的人',
    })

    const offered = await candidatesFor(ctx, 'person', mine.id)
    expect(offered.map((c) => c.title)).not.toContain('别人的人')
    expect(offered.map((c) => c.title)).not.toContain('要删掉的')

    // And the other workspace's object is not even a thing to ask about.
    const refused = await ctx.app.inject({
      method: 'GET',
      url: `/api/v1/links?view=candidates&type=person&id=${theirPerson.id}`,
      headers: web(ctx),
    })
    expect(refused.statusCode).toBe(404)
  })
})
