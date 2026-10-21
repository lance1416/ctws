import { OBJECT_TYPES, type CandidatesResponse } from '@ctws/contracts'
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
 * THE REGISTRY -- every kind of thing is named by the module that owns it, and the shell asks that
 * module rather than reading its table. What a page is connected to is the relations' business
 * (tests/shell/relations.test.ts); this is the naming underneath, and the picker built on it.
 */

const cleanups: (() => Promise<void>)[] = []

const setup = (email: string) => setupWith(cleanups, email)
afterEach(async () => {
  for (const stop of cleanups.splice(0)) await stop()
})

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
      'note',
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

/**
 * WHAT THE PICKER IS OFFERED, which is a server decision and not a UI one.
 *
 * The box the person types into shows every kind of thing at once, and each one comes out of its
 * own module's table. Everything that keeps the list honest is decided here: that the object
 * itself is never offered, that another workspace's rows are not, and that a deleted row is not.
 */
describe('what can go at the other end', () => {
  const candidatesFor = async (ctx: Harness, type: string, id: string, q = '', kinds = '') => {
    const res = await ctx.app.inject({
      method: 'GET',
      url: `/api/v1/links?view=candidates&type=${type}&id=${id}&q=${encodeURIComponent(q)}${
        kinds ? `&kinds=${kinds}` : ''
      }`,
      headers: web(ctx),
    })
    expect(res.statusCode, res.body).toBe(200)
    return (res.json() as CandidatesResponse).candidates
  }

  it('offers every kind of thing, and never the object itself', async () => {
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

  it('answers search with no thing to relate from, naming a task’s parent and a person’s work', async () => {
    const ctx = await setup('cands@example.com')
    const project = await createProject(ctx, 'Job hunt')
    const parent = await createTask(ctx, project, 'Stripe')
    await createTask(ctx, project, 'Phone screen prep', parent)
    await createPerson(ctx, { name: 'Mira Chen' })
    const res = await ctx.app.inject({
      method: 'GET',
      url: `/api/v1/links?view=candidates&q=${encodeURIComponent('phone')}&kinds=task`,
      headers: web(ctx),
    })
    expect(res.statusCode, res.body).toBe(200)
    expect((res.json() as CandidatesResponse).candidates).toEqual([
      expect.objectContaining({
        title: 'Phone screen prep',
        projectId: project,
        projectName: 'Job hunt',
        parentTitle: 'Stripe',
      }),
    ])
    const people = await ctx.app.inject({
      method: 'GET',
      url: `/api/v1/links?view=candidates&q=mira&kinds=person`,
      headers: web(ctx),
    })
    expect((people.json() as CandidatesResponse).candidates).toEqual([
      expect.objectContaining({ title: 'Mira Chen', initials: 'MC', org: null }),
    ])
    // A type without its id names nothing.
    const half = await ctx.app.inject({
      method: 'GET',
      url: `/api/v1/links?view=candidates&type=task`,
      headers: web(ctx),
    })
    expect(half.statusCode).toBe(400)
  })

  it('offers only the kinds asked for, when a field wants one kind of thing', async () => {
    const ctx = await setup('candk@example.com')
    const person = await createPerson(ctx, { name: '陈颖' })
    await createPerson(ctx, { name: '老王' })
    await createProject(ctx, '找工作')

    const book = await createReading(ctx, { kind: 'book', title: '设计心理学' })
    const people = await candidatesFor(ctx, 'reading', book.id, '', 'person')
    expect(people.map((c) => c.type)).toEqual(['person', 'person'])
    const some = await candidatesFor(ctx, 'person', person.id, '', 'project,reading')
    expect([...new Set(some.map((c) => c.type))].sort()).toEqual(['project', 'reading'])
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
