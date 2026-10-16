import type { LinksResponse, ReadingItemResponse } from '@ctws/contracts'
import { sql } from 'drizzle-orm'
import { afterEach, describe, expect, it } from 'vitest'
import { createProject, setupWith, type Harness, web } from '../../helpers/harness'

/**
 * THE READING LIST.
 *
 * Most of what is worth testing here is not the CRUD: it is the two claims the module is built
 * on. A link may have no title, because capturing one is pasting a url and nothing else. And the
 * module is SEPARATE -- its rows are scoped by workspace on their own, not through a project,
 * because an item need not have one.
 */

const cleanups: (() => Promise<void>)[] = []

const setup = () => setupWith(cleanups)
afterEach(async () => {
  for (const stop of cleanups.splice(0)) await stop()
})

const add = (ctx: Harness, payload: Record<string, unknown>) =>
  ctx.app.inject({ method: 'POST', url: '/api/v1/reading', headers: web(ctx), payload })

async function added(ctx: Harness, payload: Record<string, unknown>): Promise<ReadingItemResponse> {
  const res = await add(ctx, payload)
  if (res.statusCode !== 201) throw new Error(`add: ${res.statusCode} ${res.body}`)
  return res.json() as ReadingItemResponse
}

const patch = (ctx: Harness, id: string, payload: Record<string, unknown>) =>
  ctx.app.inject({ method: 'PATCH', url: `/api/v1/reading/${id}`, headers: web(ctx), payload })

/** Adds an item and files it under a project, as the pane does. */
async function filed(
  ctx: Harness,
  payload: Record<string, unknown>,
  projectId: string,
): Promise<ReadingItemResponse> {
  const item = await added(ctx, payload)
  const res = await patch(ctx, item.id, { projectId })
  expect(res.statusCode, res.body).toBe(200)
  return res.json() as ReadingItemResponse
}

async function list(ctx: Harness, query = ''): Promise<ReadingItemResponse[]> {
  const res = await ctx.app.inject({
    method: 'GET',
    url: `/api/v1/reading${query}`,
    headers: ctx.authed,
  })
  expect(res.statusCode).toBe(200)
  return (res.json() as { items: ReadingItemResponse[] }).items
}

describe('reading list', () => {
  it('takes a bare url, and leaves the title empty rather than inventing one', async () => {
    // A pasted link is shown by its host until somebody types a title. A server that filled the
    // title in with the url would leave
    // nobody able to tell a real title from a placeholder.
    const ctx = await setup()
    const item = await added(ctx, { kind: 'link', url: 'https://linear.app/now/redesign' })
    expect(item).toMatchObject({ kind: 'link', title: null, author: null, status: 'todo' })
    expect(item.url).toBe('https://linear.app/now/redesign')
  })

  it('keeps a book and a link apart, both ways round', async () => {
    const ctx = await setup()
    expect(
      (await add(ctx, { kind: 'book', title: '设计心理学', url: 'https://x.test' })).statusCode,
    ).toBe(400)
    expect(
      (await add(ctx, { kind: 'link', url: 'https://x.test', author: '某人' })).statusCode,
    ).toBe(400)

    const book = await added(ctx, { kind: 'book', title: '设计心理学' })
    expect(book).toMatchObject({ kind: 'book', url: null, author: null })
  })

  it('refuses a url that is not http(s), because the list renders it as a link', async () => {
    const ctx = await setup()
    for (const url of ['javascript:alert(1)', 'data:text/html,<script>']) {
      expect((await add(ctx, { kind: 'link', url })).statusCode, url).toBe(400)
    }
  })

  it('lists newest first, which is where the thing you just saved is', async () => {
    const ctx = await setup()
    await added(ctx, { kind: 'book', title: '第一本' })
    await added(ctx, { kind: 'book', title: '第二本' })
    expect((await list(ctx)).map((i) => i.title)).toEqual(['第二本', '第一本'])
  })

  it('files an item under a shell project, and says which', async () => {
    // A project is the SHELL's dimension: an article about CTWS belongs to CTWS exactly as a task
    // does, and the module hangs its rows on it without owning it.
    const ctx = await setup()
    const pid = await createProject(ctx, 'CTWS')
    const item = await filed(ctx, { kind: 'link', url: 'https://x.test/a' }, pid)
    expect(item).toMatchObject({ projectId: pid, projectName: 'CTWS' })
    const page = await ctx.app.inject({
      method: 'GET',
      url: `/api/v1/links/project/${pid}`,
      headers: web(ctx),
    })
    const groups = (page.json() as LinksResponse).groups
    expect(groups.find((g) => g.type === 'reading')?.items.map((i) => i.id)).toEqual([item.id])
  })

  it('keeps an item when its project is deleted, rather than throwing a book away', async () => {
    // Projects are SOFT-deleted, so the edge stays; the module reports only the project you can
    // still SEE, on both fields at once.
    const ctx = await setup()
    const pid = await createProject(ctx, '临时')
    const item = await filed(ctx, { kind: 'book', title: '留下来的书' }, pid)
    const del = await ctx.app.inject({
      method: 'DELETE',
      url: `/api/v1/projects/${pid}`,
      headers: web(ctx),
    })
    expect(del.statusCode).toBe(204)

    const kept = (await list(ctx)).find((i) => i.id === item.id)
    expect(kept).toMatchObject({ title: '留下来的书', projectId: null, projectName: null })
  })

  it('lists only what belongs to no project, for the workbench widget', async () => {
    // UNFILED: the workbench card's whole contents. What is filed under a project is on that
    // project's page, and a widget that repeated it would make two places to keep in your head.
    const ctx = await setup()
    const pid = await createProject(ctx, 'CTWS')
    await filed(ctx, { kind: 'link', url: 'https://x.test/filed' }, pid)
    await added(ctx, { kind: 'book', title: '散的书' })

    const loose = await list(ctx, '?unfiled=true')
    expect(loose.map((i) => i.title)).toEqual(['散的书'])
    // And it is a FILTER, not the whole list: without it both are there.
    expect(await list(ctx)).toHaveLength(2)
  })

  it('counts an item whose project was deleted as having none', async () => {
    // Projects are soft-deleted and the row reports only the project you can still SEE, so an
    // item left behind by a deleted project has to turn up here -- otherwise it would belong to
    // no list at all: absent from every project page AND from the widget.
    const ctx = await setup()
    const pid = await createProject(ctx, '没了的项目')
    await filed(ctx, { kind: 'book', title: '留下来的书' }, pid)
    await ctx.app.inject({ method: 'DELETE', url: `/api/v1/projects/${pid}`, headers: web(ctx) })

    expect((await list(ctx, '?unfiled=true')).map((i) => i.title)).toEqual(['留下来的书'])
  })

  it('refuses the fields of the other kind on a patch, as a conflict and not a crash', async () => {
    const ctx = await setup()
    const book = await added(ctx, { kind: 'book', title: '一本书' })
    const link = await added(ctx, { kind: 'link', url: 'https://x.test/b' })
    expect((await patch(ctx, book.id, { url: 'https://x.test/c' })).statusCode).toBe(409)
    expect((await patch(ctx, link.id, { author: '某人' })).statusCode).toBe(409)
    // A book with no title is not a book; a link without one falls back to its host.
    expect((await patch(ctx, book.id, { title: null })).statusCode).toBe(409)
    expect((await patch(ctx, link.id, { title: null })).statusCode).toBe(200)
  })

  it('does not let a link become a book', async () => {
    const ctx = await setup()
    const link = await added(ctx, { kind: 'link', url: 'https://x.test/d' })
    expect((await patch(ctx, link.id, { kind: 'book' })).statusCode).toBe(400)
  })

  it('finds an item by its url, because half of them have no title yet', async () => {
    const ctx = await setup()
    await added(ctx, { kind: 'link', url: 'https://linear.app/now/redesign' })
    const book = await added(ctx, { kind: 'book', title: '设计心理学' })
    expect((await patch(ctx, book.id, { author: 'Don Norman' })).statusCode).toBe(200)

    const hits = async (q: string) => {
      const res = await ctx.app.inject({
        method: 'GET',
        url: `/api/v1/reading/search?q=${encodeURIComponent(q)}`,
        headers: ctx.authed,
      })
      expect(res.statusCode).toBe(200)
      return (res.json() as { items: ReadingItemResponse[] }).items
    }
    expect((await hits('linear')).map((i) => i.url)).toEqual(['https://linear.app/now/redesign'])
    expect((await hits('Norman')).map((i) => i.title)).toEqual(['设计心理学'])
    // A wildcard typed by a person is a character, not a pattern.
    expect(await hits('%')).toEqual([])
  })

  it('hides a deleted item from every read, and refuses to delete it twice', async () => {
    const ctx = await setup()
    const item = await added(ctx, { kind: 'book', title: '不要了' })
    const del = () =>
      ctx.app.inject({ method: 'DELETE', url: `/api/v1/reading/${item.id}`, headers: web(ctx) })
    expect((await del()).statusCode).toBe(204)
    expect((await del()).statusCode).toBe(404)
    expect(await list(ctx)).toEqual([])
  })

  it('keeps one workspace out of another, as a not-found', async () => {
    const ctx = await setup()
    const mine = await added(ctx, { kind: 'book', title: '我的书' })

    // The SAME app, so this is one database and the isolation under test is real.
    const other = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      headers: { 'x-ctws-client': 'web' },
      payload: { email: 'other@example.com', password: 'correct horse battery', timezone: 'UTC' },
    })
    const theirs: Harness = {
      ...ctx,
      authed: {
        'x-ctws-client': 'web',
        cookie: String(other.headers['set-cookie']).split(';')[0]!,
      },
    }

    expect(await list(theirs)).toEqual([])
    expect((await patch(theirs, mine.id, { status: 'done' })).statusCode).toBe(404)
    const del = await theirs.app.inject({
      method: 'DELETE',
      url: `/api/v1/reading/${mine.id}`,
      headers: web(theirs),
    })
    expect(del.statusCode).toBe(404)
    // And it is still there for its owner.
    expect((await list(ctx)).map((i) => i.title)).toEqual(['我的书'])
  })

  it('refuses a project from another workspace as a not-found', async () => {
    const ctx = await setup()
    const other = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      headers: { 'x-ctws-client': 'web' },
      payload: { email: 'two@example.com', password: 'correct horse battery', timezone: 'UTC' },
    })
    const theirs: Harness = {
      ...ctx,
      authed: {
        'x-ctws-client': 'web',
        cookie: String(other.headers['set-cookie']).split(';')[0]!,
      },
    }
    const theirProject = await createProject(theirs, '别人的项目')
    const book = await added(ctx, { kind: 'book', title: 'Book' })
    expect((await patch(ctx, book.id, { projectId: theirProject })).statusCode).toBe(404)
  })

  it('leaves the item as it was when filing it under a project fails', async () => {
    const ctx = await setup()
    const projectId = await createProject(ctx, 'Shelf')
    const book = await added(ctx, { kind: 'book', title: 'Orphan' })
    // Filing the item fails; the rename in the same edit must not survive it.
    await ctx.db.execute(sql`
      create function refuse_reading_filing() returns trigger language plpgsql as $$
      begin
        if new.from_type = 'reading' then raise exception 'refused for the test'; end if;
        return new;
      end $$
    `)
    await ctx.db.execute(sql`
      create trigger refuse_reading_filing before insert on links
        for each row execute function refuse_reading_filing()
    `)

    const res = await patch(ctx, book.id, { title: 'Renamed', projectId })
    expect(res.statusCode).toBe(500)
    expect((await list(ctx)).map((i) => i.title)).toEqual(['Orphan'])
  })
})
