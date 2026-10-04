import { sql } from 'drizzle-orm'
import { afterEach, describe, expect, it } from 'vitest'
import { SEARCH_LIMIT } from '@ctws/contracts'
import { likePattern } from '../src/tasks/search'
import { appWithUser, createProject, createTask, type TaskCtx } from './helpers/tasks'

const cleanups: (() => Promise<void>)[] = []
afterEach(async () => {
  for (const stop of cleanups.splice(0)) await stop()
})

async function setup() {
  const ctx = await appWithUser()
  cleanups.push(ctx.stop)
  return ctx
}

type Row = {
  id: string
  title: string
  status: string
  projectName: string
  parentTitle: string | null
  projectArchived: boolean
}

async function search(ctx: TaskCtx, q: string, cookie?: string): Promise<Row[]> {
  const res = await ctx.app.inject({
    method: 'GET',
    url: `/api/v1/search?q=${encodeURIComponent(q)}`,
    headers: cookie ? { 'x-ctws-client': 'web', cookie } : ctx.authed,
  })
  expect(res.statusCode).toBe(200)
  return res.json().tasks as Row[]
}

const titles = (rows: Row[]) => rows.map((r) => r.title)

async function patch(ctx: TaskCtx, id: string, payload: Record<string, unknown>) {
  const res = await ctx.app.inject({
    method: 'PATCH',
    url: `/api/v1/tasks/${id}`,
    headers: ctx.authed,
    payload,
  })
  expect(res.statusCode).toBe(200)
}

describe('likePattern', () => {
  it('escapes the LIKE wildcards so they are searched for literally', () => {
    // Without this, `100%` matches every task in the workspace and `a_b` matches `axb`: a search
    // that returns the WRONG rows, which looks like a working search.
    expect(likePattern('100%')).toBe('%100!%%')
    expect(likePattern('a_b')).toBe('%a!_b%')
    expect(likePattern('a!b')).toBe('%a!!b%')
    expect(likePattern('plain')).toBe('%plain%')
  })
})

describe('GET /search', () => {
  it('requires authentication', async () => {
    const ctx = await setup()
    const res = await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/search?q=anything',
      headers: { 'x-ctws-client': 'web' },
    })
    expect(res.statusCode).toBe(401)
  })

  it('refuses a missing or blank query rather than returning everything', async () => {
    const ctx = await setup()
    const project = await createProject(ctx, 'Alpha')
    await createTask(ctx, project, 'something')
    for (const url of ['/api/v1/search', '/api/v1/search?q=', '/api/v1/search?q=%20%20']) {
      const res = await ctx.app.inject({ method: 'GET', url, headers: ctx.authed })
      expect(res.statusCode, url).toBe(400)
    }
  })

  it('finds tasks in every project, not just one, and carries project and parent', async () => {
    const ctx = await setup()
    const alpha = await createProject(ctx, 'Alpha')
    const beta = await createProject(ctx, 'Beta')
    const parent = await createTask(ctx, beta, '迁移计划')
    await createTask(ctx, alpha, '写 needle 的测试')
    const nested = await createTask(ctx, beta, 'needle 在深处', parent)
    await createTask(ctx, alpha, '无关的任务')

    const rows = await search(ctx, 'needle')
    expect(titles(rows).sort()).toEqual(['needle 在深处', '写 needle 的测试'].sort())
    expect(rows.find((r) => r.id === nested)).toMatchObject({
      projectName: 'Beta',
      parentTitle: '迁移计划',
      projectArchived: false,
    })
    expect(rows.find((r) => r.title === '写 needle 的测试')).toMatchObject({
      projectName: 'Alpha',
      parentTitle: null,
    })
  })

  it('matches notes as well as titles, and is case-insensitive on both', async () => {
    const ctx = await setup()
    const project = await createProject(ctx, 'Alpha')
    const byNotes = await createTask(ctx, project, '一个标题')
    await patch(ctx, byNotes, { notes: '记得问 Kafka 的保留期' })
    await createTask(ctx, project, 'KAFKA 迁移')
    await createTask(ctx, project, '别的事')

    const rows = await search(ctx, 'kafka')
    expect(titles(rows).sort()).toEqual(['KAFKA 迁移', '一个标题'].sort())
  })

  it('puts title matches before notes-only matches', async () => {
    const ctx = await setup()
    const project = await createProject(ctx, 'Alpha')
    // The notes-only task is created FIRST and then touched LAST, so recency alone would put it
    // on top: the order can only come from the title/notes ranking.
    const notesOnly = await createTask(ctx, project, '毫不相关')
    await createTask(ctx, project, 'widget 重写')
    await patch(ctx, notesOnly, { notes: '顺便看看 widget' })

    expect(titles(await search(ctx, 'widget'))).toEqual(['widget 重写', '毫不相关'])
  })

  it('treats % and _ as characters, not wildcards', async () => {
    const ctx = await setup()
    const project = await createProject(ctx, 'Alpha')
    await createTask(ctx, project, '把覆盖率提到 100% 以上')
    await createTask(ctx, project, '完全不含百分号的任务')

    expect(titles(await search(ctx, '100%'))).toEqual(['把覆盖率提到 100% 以上'])
    // `%` alone is a wildcard that would match everything; as a literal it matches only the one.
    expect(titles(await search(ctx, '%'))).toEqual(['把覆盖率提到 100% 以上'])
  })

  it('includes done and cancelled tasks, with their status', async () => {
    const ctx = await setup()
    const project = await createProject(ctx, 'Alpha')
    const done = await createTask(ctx, project, 'ember 做完了')
    const cancelled = await createTask(ctx, project, 'ember 不做了')
    await createTask(ctx, project, 'ember 还在做')
    await patch(ctx, done, { status: 'done' })
    await patch(ctx, cancelled, { status: 'cancelled' })

    const rows = await search(ctx, 'ember')
    expect(rows).toHaveLength(3)
    expect(Object.fromEntries(rows.map((r) => [r.title, r.status]))).toEqual({
      'ember 做完了': 'done',
      'ember 不做了': 'cancelled',
      'ember 还在做': 'backlog',
    })
  })

  it('includes archived projects and says that they are archived', async () => {
    const ctx = await setup()
    const archived = await createProject(ctx, 'Old')
    const live = await createProject(ctx, 'New')
    await createTask(ctx, archived, 'relic 的笔记')
    await createTask(ctx, live, 'relic 的下一步')
    const res = await ctx.app.inject({
      method: 'PATCH',
      url: `/api/v1/projects/${archived}`,
      headers: ctx.authed,
      payload: { archived: true },
    })
    expect(res.statusCode).toBe(200)

    const rows = await search(ctx, 'relic')
    expect(Object.fromEntries(rows.map((r) => [r.projectName, r.projectArchived]))).toEqual({
      Old: true,
      New: false,
    })
  })

  it('excludes a deleted task', async () => {
    const ctx = await setup()
    const project = await createProject(ctx, 'Alpha')
    const kept = await createTask(ctx, project, 'ghost 留着')
    const gone = await createTask(ctx, project, 'ghost 删掉')
    const res = await ctx.app.inject({
      method: 'DELETE',
      url: `/api/v1/tasks/${gone}`,
      headers: ctx.authed,
    })
    expect(res.statusCode).toBe(204)

    expect((await search(ctx, 'ghost')).map((r) => r.id)).toEqual([kept])
  })

  it('excludes everything in a deleted project', async () => {
    const ctx = await setup()
    const doomed = await createProject(ctx, 'Doomed')
    const kept = await createProject(ctx, 'Kept')
    await createTask(ctx, doomed, 'shade 这条随项目消失')
    const survivor = await createTask(ctx, kept, 'shade 这条留下')
    const res = await ctx.app.inject({
      method: 'DELETE',
      url: `/api/v1/projects/${doomed}`,
      headers: ctx.authed,
    })
    expect(res.statusCode).toBe(204)

    // A project delete does NOT soft-delete its tasks, so this tests the project-join filter and
    // nothing else.
    expect((await search(ctx, 'shade')).map((r) => r.id)).toEqual([survivor])
  })

  it('never returns tasks from another workspace', async () => {
    const ctx = await setup()
    const mine = await createProject(ctx, 'Mine')
    await createTask(ctx, mine, 'secret 我的')

    // A second user in the SAME database: two appWithUser() calls would be two databases, and the
    // assertion below would hold with no scoping at all.
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      headers: { 'x-ctws-client': 'web' },
      payload: { email: 'other@example.com', password: 'correct horse battery', timezone: 'UTC' },
    })
    expect(res.statusCode).toBe(201)
    const otherCookie = String(res.headers['set-cookie']).split(';')[0]!

    expect(await search(ctx, 'secret', otherCookie)).toEqual([])
    // And the owner still finds it, so the empty result above is the scoping and not a typo.
    expect(titles(await search(ctx, 'secret'))).toEqual(['secret 我的'])
  })

  it('caps the result set', async () => {
    const ctx = await setup()
    const project = await createProject(ctx, 'Alpha')
    await ctx.db.execute(sql`
      insert into tasks (id, project_id, title, status, rank)
      select gen_random_uuid(), ${project}, 'bulk ' || g, 'backlog', lpad(g::text, 6, '0')
      from generate_series(1, ${SEARCH_LIMIT + 5}) g
    `)
    expect(await search(ctx, 'bulk')).toHaveLength(SEARCH_LIMIT)
  })
})
