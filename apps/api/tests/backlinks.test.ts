import {
  OBJECT_TYPES,
  type CandidatesResponse,
  type ContactResponse,
  type LinksResponse,
} from '@ctws/contracts'
import { afterEach, describe, expect, it } from 'vitest'
import { EVERY_TYPE_ANSWERED, LINKABLES } from '../src/links/registry'
import { createProject, createTask, setupWith, type TaskCtx, web } from './helpers/tasks'

/**
 * 反向链接 -- open a thing, see everything it is connected to.
 *
 * This is the half of the edge table that was not possible before. Nothing is written on a
 * person's record when a meeting names them as a guest; one row says both facts, and this read is
 * what turns the second one into a page. Every assertion here fails against the old model, where
 * a person's page could show nothing but their own fields.
 */

const cleanups: (() => Promise<void>)[] = []

const setup = (email: string) => setupWith(cleanups, email)
afterEach(async () => {
  for (const stop of cleanups.splice(0)) await stop()
})

async function post<T>(ctx: TaskCtx, url: string, payload: Record<string, unknown>): Promise<T> {
  const res = await ctx.app.inject({ method: 'POST', url, headers: web(ctx), payload })
  if (res.statusCode !== 201) throw new Error(`${url}: ${res.statusCode} ${res.body}`)
  return res.json() as T
}

async function linksOf(ctx: TaskCtx, type: string, id: string): Promise<LinksResponse['groups']> {
  const res = await ctx.app.inject({
    method: 'GET',
    url: `/api/v1/links/${type}/${id}`,
    headers: web(ctx),
  })
  expect(res.statusCode, res.body).toBe(200)
  return (res.json() as LinksResponse).groups
}

const titles = (groups: LinksResponse['groups'], type: string) =>
  groups.find((g) => g.type === type)?.items.map((i) => i.title) ?? []

describe('every kind of thing has a module that answers for it', () => {
  it('covers the contract exactly, so no group can go silently missing', () => {
    expect(EVERY_TYPE_ANSWERED).toBe(true)
    expect([...LINKABLES].map((l) => l.type).sort()).toEqual([...OBJECT_TYPES].sort())
  })
})

describe('opening a thing shows what it is connected to', () => {
  it('shows a person the meetings they are in, without anything written on their record', async () => {
    const ctx = await setup('back@example.com')
    const person = await post<ContactResponse>(ctx, '/api/v1/contacts', {
      name: '陈颖',
      org: 'Acme 招聘',
    })
    // The guest list is written on the MEETING. The person's record is untouched.
    for (const [title, startsLocal] of [
      ['二面', '2026-10-20T21:00'],
      ['一面', '2026-10-06T20:00'],
    ]) {
      await post(ctx, '/api/v1/meetings', {
        title,
        startsLocal,
        timeZone: 'America/Toronto',
        durationMinutes: 60,
        attendeeIds: [person.id],
      })
    }

    const groups = await linksOf(ctx, 'contact', person.id)
    expect(titles(groups, 'meeting')).toEqual(['一面', '二面'])
    const meetings = groups.find((g) => g.type === 'meeting')!
    expect(meetings.label).toBe('Meetings')
    // Read AGAINST the edge, because the row says 「这个会 参与 陈颖」 and this is the other end.
    expect(meetings.items.every((i) => i.outgoing === false)).toBe(true)
    expect(meetings.items.every((i) => i.label === 'attended')).toBe(true)
    // The zone is named the way a person says it, on the meeting's OWN wall clock.
    expect(meetings.items.map((i) => i.detail)).toEqual([
      'Oct 6, 20:00 · EDT',
      'Oct 20, 21:00 · EDT',
    ])
  })

  it('shows a project everything on it, tasks included, in one uniform set of edges', async () => {
    const ctx = await setup('project@example.com')
    const project = await createProject(ctx, '找工作')
    await createTask(ctx, project, '改简历')
    const person = await post<ContactResponse>(ctx, '/api/v1/contacts', {
      name: '陈颖',
      projectIds: [project],
    })
    await post(ctx, '/api/v1/reading', {
      kind: 'link',
      url: 'https://example.test/a',
      title: '面试准备',
      projectId: project,
    })
    await post(ctx, '/api/v1/meetings', {
      title: '二面',
      startsLocal: '2026-10-20T21:00',
      timeZone: 'America/Toronto',
      durationMinutes: 60,
      projectId: project,
      attendeeIds: [person.id],
    })

    const groups = await linksOf(ctx, 'project', project)
    // Groups come out in registry order, not in whatever order the edges were stored.
    expect(groups.map((g) => g.type)).toEqual(['task', 'meeting', 'contact', 'reading'])
    // The task's project is still a COLUMN; the page cannot tell, which is the point.
    expect(titles(groups, 'task')).toEqual(['改简历'])
    expect(titles(groups, 'meeting')).toEqual(['二面'])
    expect(titles(groups, 'contact')).toEqual(['陈颖'])
    expect(titles(groups, 'reading')).toEqual(['面试准备'])
  })

  it('leaves out what was deleted, rather than drawing a row nobody can open', async () => {
    const ctx = await setup('gone@example.com')
    const person = await post<ContactResponse>(ctx, '/api/v1/contacts', { name: '陈颖' })
    const meeting = await post<{ meetingId: string }>(ctx, '/api/v1/meetings', {
      title: '二面',
      startsLocal: '2026-10-20T21:00',
      timeZone: 'America/Toronto',
      durationMinutes: 60,
      attendeeIds: [person.id],
    })
    expect(titles(await linksOf(ctx, 'contact', person.id), 'meeting')).toEqual(['二面'])

    const dropped = await ctx.app.inject({
      method: 'DELETE',
      url: `/api/v1/meetings/${meeting.meetingId}`,
      headers: web(ctx),
    })
    expect(dropped.statusCode, dropped.body).toBe(204)
    expect(await linksOf(ctx, 'contact', person.id)).toEqual([])
  })

  it('refuses a page for a thing this workspace cannot see', async () => {
    const ctx = await setup('mine2@example.com')
    const them = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      headers: { 'x-ctws-client': 'web' },
      payload: { email: 'theirs2@example.com', password: 'correct horse battery', timezone: 'UTC' },
    })
    expect(them.statusCode, them.body).toBe(201)
    const theirHeaders = {
      'x-ctws-client': 'web',
      cookie: String(them.headers['set-cookie']).split(';')[0]!,
    }
    const myPerson = await post<ContactResponse>(ctx, '/api/v1/contacts', { name: '陈颖' })

    const reached = await ctx.app.inject({
      method: 'GET',
      url: `/api/v1/links/contact/${myPerson.id}`,
      headers: theirHeaders,
    })
    expect(reached.statusCode, reached.body).toBe(404)
  })
})

describe('making and removing one edge by hand', () => {
  it('accepts a kind the model allows, and reads it back from both ends', async () => {
    const ctx = await setup('edge@example.com')
    const person = await post<ContactResponse>(ctx, '/api/v1/contacts', { name: '陈颖' })
    const reading = await post<{ id: string }>(ctx, '/api/v1/reading', {
      kind: 'book',
      title: '设计心理学',
    })

    const made = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/links',
      headers: web(ctx),
      payload: {
        from: { type: 'contact', id: person.id },
        to: { type: 'reading', id: reading.id },
        kind: 'recommends',
      },
    })
    expect(made.statusCode, made.body).toBe(201)

    // 「陈颖 推荐 设计心理学」 and 「设计心理学 推荐人 陈颖」 are one row read two ways.
    const theirs = await linksOf(ctx, 'contact', person.id)
    expect(theirs.find((g) => g.type === 'reading')!.items[0]).toMatchObject({
      title: '设计心理学',
      label: 'recommended',
      outgoing: true,
    })
    const books = await linksOf(ctx, 'reading', reading.id)
    expect(books.find((g) => g.type === 'contact')!.items[0]).toMatchObject({
      title: '陈颖',
      label: 'recommended by',
      outgoing: false,
    })

    const removed = await ctx.app.inject({
      method: 'DELETE',
      url:
        '/api/v1/links?' +
        new URLSearchParams({
          fromType: 'contact',
          fromId: person.id,
          toType: 'reading',
          toId: reading.id,
          kind: 'recommends',
        }),
      headers: web(ctx),
    })
    expect(removed.statusCode, removed.body).toBe(204)
    expect(await linksOf(ctx, 'contact', person.id)).toEqual([])
  })

  it('refuses a kind the model does not allow, and an end that is not there', async () => {
    const ctx = await setup('bad@example.com')
    const person = await post<ContactResponse>(ctx, '/api/v1/contacts', { name: '陈颖' })
    const other = await post<ContactResponse>(ctx, '/api/v1/contacts', { name: '另一个人' })

    const make = (payload: Record<string, unknown>) =>
      ctx.app.inject({ method: 'POST', url: '/api/v1/links', headers: web(ctx), payload })

    // 推荐 runs from a person to something to read, never between two people.
    const wrongEnds = await make({
      from: { type: 'contact', id: person.id },
      to: { type: 'contact', id: other.id },
      kind: 'recommends',
    })
    expect(wrongEnds.statusCode).toBe(400)

    // A thing cannot be related to itself, whatever the kind.
    const itself = await make({
      from: { type: 'contact', id: person.id },
      to: { type: 'contact', id: person.id },
      kind: 'about',
    })
    expect(itself.statusCode).toBe(400)

    // An id of the right shape that names nothing is 「没有这个东西」, not a stored edge.
    const nowhere = await make({
      from: { type: 'contact', id: person.id },
      to: { type: 'reading', id: '99999999-9999-4999-8999-999999999999' },
      kind: 'recommends',
    })
    expect(nowhere.statusCode).toBe(404)
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
    await post<ContactResponse>(ctx, '/api/v1/contacts', { name: '陈颖', projectIds: [project] })

    const groups = await linksOf(ctx, 'project', project)
    const task = groups.find((g) => g.type === 'task')!.items[0]!
    const person = groups.find((g) => g.type === 'contact')!.items[0]!

    // The task's project is a column the task module keeps; the person's is a row in `links`.
    expect(task).toMatchObject({ title: '改简历', removable: false })
    expect(person).toMatchObject({ title: '陈颖', removable: true })
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
  const candidatesFor = async (ctx: TaskCtx, type: string, id: string, q = '') => {
    const res = await ctx.app.inject({
      method: 'GET',
      url: `/api/v1/links/candidates?type=${type}&id=${id}&q=${encodeURIComponent(q)}`,
      headers: web(ctx),
    })
    expect(res.statusCode, res.body).toBe(200)
    return (res.json() as CandidatesResponse).candidates
  }

  it('offers every kind the model allows, and never the object itself', async () => {
    const ctx = await setup('cand@example.com')
    const project = await createProject(ctx, '找工作')
    await createTask(ctx, project, '改简历')
    const person = await post<ContactResponse>(ctx, '/api/v1/contacts', { name: '陈颖' })
    const other = await post<ContactResponse>(ctx, '/api/v1/contacts', { name: '老王' })
    await post(ctx, '/api/v1/reading', { kind: 'book', title: '设计心理学' })
    await post(ctx, '/api/v1/meetings', {
      title: '二面',
      startsLocal: '2026-10-20T21:00',
      timeZone: 'America/Toronto',
      durationMinutes: 60,
    })

    const offered = await candidatesFor(ctx, 'contact', person.id)
    // One box, every kind of thing, each out of its own module's table.
    expect([...new Set(offered.map((c) => c.type))].sort()).toEqual([
      'contact',
      'meeting',
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
      detail: '找工作',
    })
    // ...and a finished one says so on the same line, rather than losing the project to say it.
    const done = await createTask(ctx, project, '投出去了')
    await ctx.app.inject({
      method: 'PATCH',
      url: `/api/v1/tasks/${done}`,
      headers: web(ctx),
      payload: { status: 'done' },
    })
    const after = await candidatesFor(ctx, 'contact', person.id)
    expect(after.find((c) => c.id === done)?.detail).toBe('找工作 · Done')
  })

  it('narrows to what was typed, across the modules at once', async () => {
    const ctx = await setup('candq@example.com')
    const person = await post<ContactResponse>(ctx, '/api/v1/contacts', { name: '陈颖' })
    await post(ctx, '/api/v1/reading', { kind: 'book', title: '设计心理学' })
    await post(ctx, '/api/v1/reading', { kind: 'book', title: '代码整洁之道' })
    const project = await createProject(ctx, '设计系统')

    const found = await candidatesFor(ctx, 'contact', person.id, '设计')
    expect(found.map((c) => [c.type, c.title]).sort()).toEqual([
      ['project', '设计系统'],
      ['reading', '设计心理学'],
    ])
    expect(found.some((c) => c.title === '代码整洁之道')).toBe(false)
    // And the wildcards are characters, not patterns: `_` would match any one character.
    expect(await candidatesFor(ctx, 'contact', person.id, '设_系统')).toEqual([])
    expect(project).toBeTruthy()
  })

  it('offers nothing from another workspace, and nothing deleted', async () => {
    const ctx = await setup('candiso@example.com')
    const mine = await post<ContactResponse>(ctx, '/api/v1/contacts', { name: '陈颖' })
    const doomed = await post<ContactResponse>(ctx, '/api/v1/contacts', { name: '要删掉的' })
    await ctx.app.inject({
      method: 'DELETE',
      url: `/api/v1/contacts/${doomed.id}`,
      headers: web(ctx),
    })

    // A second user in the SAME app, so the two workspaces really are rows in one database.
    const registered = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      headers: { 'x-ctws-client': 'web' },
      payload: { email: 'theirs@example.com', password: 'correct horse battery', timezone: 'UTC' },
    })
    const theirs = {
      'x-ctws-client': 'web',
      cookie: String(registered.headers['set-cookie']).split(';')[0]!,
    }
    await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/contacts',
      headers: theirs,
      payload: { name: '别人的人' },
    })

    const offered = await candidatesFor(ctx, 'contact', mine.id)
    expect(offered.map((c) => c.title)).not.toContain('别人的人')
    expect(offered.map((c) => c.title)).not.toContain('要删掉的')

    // And the other workspace's object is not even a thing to ask about.
    const theirPerson = await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/contacts',
      headers: theirs,
    })
    const theirId = (theirPerson.json() as { contacts: { id: string }[] }).contacts[0]!.id
    const refused = await ctx.app.inject({
      method: 'GET',
      url: `/api/v1/links/candidates?type=contact&id=${theirId}`,
      headers: web(ctx),
    })
    expect(refused.statusCode).toBe(404)
  })
})
