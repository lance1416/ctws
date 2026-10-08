import { OBJECT_TYPES, type ContactResponse, type LinksResponse } from '@ctws/contracts'
import { afterEach, describe, expect, it } from 'vitest'
import { EVERY_TYPE_ANSWERED, LINKABLES } from '../src/links/registry'
import { appWithUser, createProject, createTask, type TaskCtx } from './helpers/tasks'

/**
 * 反向链接 -- open a thing, see everything it is connected to.
 *
 * This is the half of the edge table that was not possible before. Nothing is written on a
 * person's record when a meeting names them as a guest; one row says both facts, and this read is
 * what turns the second one into a page. Every assertion here fails against the old model, where
 * a person's page could show nothing but their own fields.
 */

const cleanups: (() => Promise<void>)[] = []
afterEach(async () => {
  for (const stop of cleanups.splice(0)) await stop()
})

async function setup(email: string): Promise<TaskCtx> {
  const ctx = await appWithUser(email)
  cleanups.push(ctx.stop)
  return ctx
}

const web = (ctx: TaskCtx) => ({ ...ctx.authed, 'x-ctws-client': 'web' })

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
    for (const title of ['二面', '一面']) {
      await post(ctx, '/api/v1/meetings', {
        title,
        startsLocal: '2026-10-20T21:00',
        timeZone: 'America/Toronto',
        durationMinutes: 60,
        attendeeIds: [person.id],
      })
    }

    const groups = await linksOf(ctx, 'contact', person.id)
    expect(titles(groups, 'meeting')).toEqual(['一面', '二面'])
    const meetings = groups.find((g) => g.type === 'meeting')!
    expect(meetings.label).toBe('会议')
    // Read AGAINST the edge, because the row says 「这个会 参与 陈颖」 and this is the other end.
    expect(meetings.items.every((i) => i.outgoing === false)).toBe(true)
    expect(meetings.items.every((i) => i.label === '参加过')).toBe(true)
    expect(meetings.items[0]!.detail).toContain('America/Toronto')
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
      label: '推荐',
      outgoing: true,
    })
    const books = await linksOf(ctx, 'reading', reading.id)
    expect(books.find((g) => g.type === 'contact')!.items[0]).toMatchObject({
      title: '陈颖',
      label: '推荐人',
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
