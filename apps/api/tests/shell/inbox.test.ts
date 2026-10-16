import { sql } from 'drizzle-orm'
import { afterEach, describe, expect, it } from 'vitest'
import { sqlStateOf } from '../helpers/sql'
import { appWithUser, createProject } from '../helpers/harness'

const cleanups: (() => Promise<void>)[] = []
afterEach(async () => {
  for (const stop of cleanups.splice(0)) await stop()
})

async function setup() {
  const ctx = await appWithUser()
  cleanups.push(ctx.stop)
  return ctx
}

async function projectsOf(ctx: Awaited<ReturnType<typeof setup>>) {
  const res = await ctx.app.inject({ method: 'GET', url: '/api/v1/projects', headers: ctx.authed })
  return res.json().projects as { id: string; name: string; isInbox: boolean }[]
}

describe('inbox project', () => {
  it('is created by registration', async () => {
    const ctx = await setup()
    const inboxes = (await projectsOf(ctx)).filter((p) => p.isInbox)
    expect(inboxes).toHaveLength(1)
  })

  it('sorts ahead of every other project regardless of rank', async () => {
    const ctx = await setup()
    const low = await createProject(ctx, 'aaa')
    await createProject(ctx, 'zzz')
    // Fresh projects rank after the inbox, which would pass even with no inbox-first ordering.
    // Force one to rank bytewise below it ('A0' < 'a0' under COLLATE "C").
    await ctx.db.execute(sql`update projects set rank = 'A0' where id = ${low}`)
    const list = await projectsOf(ctx)
    expect(list[0]!.isInbox).toBe(true)
    expect(list.slice(1).every((p) => !p.isInbox)).toBe(true)
  })

  // The DB, not the app layer, guarantees "exactly one inbox per workspace".
  it('cannot have a second inbox in one workspace', async () => {
    const ctx = await setup()
    const rows = (
      await ctx.db.execute(sql`select workspace_id from projects where is_inbox limit 1`)
    ).rows as { workspace_id: string }[]
    const wsId = rows[0]!.workspace_id
    const UNIQUE_VIOLATION = '23505'
    expect(
      await sqlStateOf(
        ctx.db.execute(sql`
          insert into projects (id, workspace_id, name, rank, is_inbox, color)
          values (gen_random_uuid(), ${wsId}, 'second inbox', 'zz', true, 'project-1')
        `),
      ),
    ).toBe(UNIQUE_VIOLATION)
  })
})

describe('deleting the inbox', () => {
  async function del(ctx: Awaited<ReturnType<typeof setup>>, id: string) {
    return ctx.app.inject({ method: 'DELETE', url: `/api/v1/projects/${id}`, headers: ctx.authed })
  }

  // 409, not 404: it exists, it just may not be deleted. A 404 would make the caller think
  // they had the wrong id.
  it('refuses with 409 and leaves it in place', async () => {
    const ctx = await setup()
    const inbox = (await projectsOf(ctx)).find((p) => p.isInbox)!
    const res = await del(ctx, inbox.id)
    expect(res.statusCode).toBe(409)
    expect(res.headers['content-type']).toContain('application/problem+json')
    expect((await projectsOf(ctx)).some((p) => p.id === inbox.id)).toBe(true)
  })

  it('still deletes an ordinary project', async () => {
    const ctx = await setup()
    const id = await createProject(ctx, 'ordinary')
    expect((await del(ctx, id)).statusCode).toBe(204)
  })

  // Archiving has the same user-visible consequence as deleting: the inbox leaves the default
  // project list, `inboxOf` finds nothing, and quick capture stops working.
  it('refuses to archive the inbox with 409', async () => {
    const ctx = await setup()
    const inbox = (await projectsOf(ctx)).find((p) => p.isInbox)!
    const res = await ctx.app.inject({
      method: 'PATCH',
      url: `/api/v1/projects/${inbox.id}`,
      headers: ctx.authed,
      payload: { archived: true },
    })
    expect(res.statusCode).toBe(409)
    expect((await projectsOf(ctx)).some((p) => p.id === inbox.id)).toBe(true)
  })

  // A rename is fine: the inbox is found by its flag, never by its name.
  it('still allows renaming the inbox', async () => {
    const ctx = await setup()
    const inbox = (await projectsOf(ctx)).find((p) => p.isInbox)!
    const res = await ctx.app.inject({
      method: 'PATCH',
      url: `/api/v1/projects/${inbox.id}`,
      headers: ctx.authed,
      payload: { name: 'Inbox' },
    })
    expect(res.statusCode).toBe(200)
    expect((await projectsOf(ctx)).find((p) => p.isInbox)!.name).toBe('Inbox')
  })

  // Unarchiving is harmless, and refusing it would be a trap if an inbox ever did get archived.
  it('allows archived: false on the inbox', async () => {
    const ctx = await setup()
    const inbox = (await projectsOf(ctx)).find((p) => p.isInbox)!
    const res = await ctx.app.inject({
      method: 'PATCH',
      url: `/api/v1/projects/${inbox.id}`,
      headers: ctx.authed,
      payload: { archived: false },
    })
    expect(res.statusCode).toBe(200)
  })
})
