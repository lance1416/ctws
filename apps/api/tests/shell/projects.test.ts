import { sql } from 'drizzle-orm'
import { afterEach, describe, expect, it } from 'vitest'
import { appWithUser, type Harness, secondUser } from '../helpers/harness'
import { createProject, createTask } from '../helpers/builders'

const cleanups: (() => Promise<void>)[] = []
afterEach(async () => {
  while (cleanups.length) await cleanups.pop()!()
})

const headers = { 'x-ctws-client': 'web' }

async function setup(email?: string): Promise<Harness> {
  const ctx = await appWithUser(email)
  cleanups.push(ctx.stop)
  return ctx
}

// Registration creates the workspace's inbox, so a fresh workspace is not empty; these tests are
// about ordinary projects.
type Listed = { id: string; isInbox: boolean }
type Named = { id: string; isInbox: boolean; name: string; color: string }
const ordinary = (body: { projects: Listed[] }) => body.projects.filter((p) => !p.isInbox)

describe('projects', () => {
  // THE IDENTITY COLOUR IS A SLOT, ASSIGNED ONCE by the server: six buckets hashed from the id
  // would collide on four projects 72% of the time.
  describe('identity colour', () => {
    const colorsOf = async (ctx: Harness) => {
      const res = await ctx.app.inject({
        method: 'GET',
        url: '/api/v1/projects',
        headers: ctx.authed,
      })
      return (res.json() as { projects: Named[] }).projects
    }

    it('gives the first eight projects eight different colours, inbox included', async () => {
      const ctx = await setup()
      for (let i = 0; i < 7; i += 1) await createProject(ctx, `P${i}`)
      const all = await colorsOf(ctx)
      expect(all).toHaveLength(8)
      expect(new Set(all.map((p) => p.color)).size).toBe(8)
      // The inbox is every workspace's first project, so it is blue.
      expect(all.find((p) => p.isInbox)!.color).toBe('blue')
    })

    it('starts from the least used once all eight are taken (FR-052)', async () => {
      const ctx = await setup()
      for (let i = 0; i < 8; i += 1) await createProject(ctx, `P${i}`)
      const all = await colorsOf(ctx)
      expect(all).toHaveLength(9)
      // Predictable rather than lucky: the NINTH project is the first to repeat, and it repeats
      // the first of the equally least used, which the inbox holds.
      expect(all.filter((p) => p.color === 'blue')).toHaveLength(2)
    })

    it('takes a colour and initials when given, and initials from the name otherwise', async () => {
      const ctx = await setup()
      const made = await ctx.app.inject({
        method: 'POST',
        url: '/api/v1/projects',
        headers: { ...ctx.authed, ...headers },
        payload: { name: 'Job hunt', color: 'teal' },
      })
      expect(made.statusCode, made.body).toBe(201)
      expect(made.json()).toMatchObject({ color: 'teal', initials: 'JH' })
      const given = await ctx.app.inject({
        method: 'POST',
        url: '/api/v1/projects',
        headers: { ...ctx.authed, ...headers },
        payload: { name: 'Thesis', initials: 'Th' },
      })
      expect(given.json()).toMatchObject({ initials: 'Th' })
      const changed = await ctx.app.inject({
        method: 'PATCH',
        url: `/api/v1/projects/${(made.json() as { id: string }).id}`,
        headers: { ...ctx.authed, ...headers },
        payload: { initials: 'JS' },
      })
      expect(changed.json()).toMatchObject({ initials: 'JS' })
    })

    it('does not hand a new project the slot an archived one still holds', async () => {
      const ctx = await setup()
      const id = await createProject(ctx, 'archived')
      const before = (await colorsOf(ctx)).find((p) => !p.isInbox)!.color
      await ctx.app.inject({
        method: 'PATCH',
        url: `/api/v1/projects/${id}`,
        headers: { ...ctx.authed, ...headers },
        payload: { archived: true },
      })
      await createProject(ctx, 'new')
      // The archived project is not in the default list, so this asserts on the slot NUMBER
      // rather than on distinctness: slot 2 is gone even though nothing visible is wearing it.
      const all = await colorsOf(ctx)
      expect(before).toBe('amber')
      // Un-archiving must not repaint a project, which means the slot stays spoken for -- the same
      // reason an archived project keeps its rank.
      expect(all.find((p) => p.name === 'new')!.color).toBe('green')
    })
  })

  it('starts with only the inbox', async () => {
    const ctx = await setup()
    const res = await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/projects',
      headers: ctx.authed,
    })
    expect(res.statusCode).toBe(200)
    const list = (res.json() as { projects: Listed[] }).projects
    expect(list).toHaveLength(1)
    expect(list[0]!.isInbox).toBe(true)
  })

  it('creates a project and lists it', async () => {
    const ctx = await setup()
    const created = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/projects',
      headers: ctx.authed,
      payload: { name: 'CTWS' },
    })
    expect(created.statusCode).toBe(201)
    expect(created.json()).toMatchObject({ name: 'CTWS' })
    expect(created.json().id).toMatch(/^[0-9a-f-]{36}$/)

    const list = await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/projects',
      headers: ctx.authed,
    })
    expect(ordinary(list.json())).toHaveLength(1)
  })

  it('appends new projects to the end', async () => {
    const ctx = await setup()
    const ids = [
      await createProject(ctx, 'one'),
      await createProject(ctx, 'two'),
      await createProject(ctx, 'three'),
    ]
    const list = await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/projects',
      headers: ctx.authed,
    })
    expect(ordinary(list.json()).map((p) => p.id)).toEqual(ids)
  })

  it('rejects a client-supplied rank', async () => {
    const ctx = await setup()
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/projects',
      headers: ctx.authed,
      payload: { name: 'x', rank: 'a0' },
    })
    expect(res.statusCode).toBe(400)
  })

  it('refuses a colour it does not know, and never takes one away', async () => {
    const ctx = await setup()
    const create = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/projects',
      headers: ctx.authed,
      payload: { name: 'x', color: 'project-4' },
    })
    expect(create.statusCode).toBe(400)
    const id = await createProject(ctx, 'x')
    const patch = (color: unknown) =>
      ctx.app.inject({
        method: 'PATCH',
        url: `/api/v1/projects/${id}`,
        headers: ctx.authed,
        payload: { color },
      })
    expect((await patch(null)).statusCode).toBe(400)
    const recoloured = await patch('violet')
    expect(recoloured.statusCode).toBe(200)
    expect(recoloured.json()).toMatchObject({ color: 'violet' })
  })

  it('requires authentication', async () => {
    const ctx = await setup()
    const res = await ctx.app.inject({ method: 'GET', url: '/api/v1/projects', headers })
    expect(res.statusCode).toBe(401)
  })

  it('renames a project', async () => {
    const ctx = await setup()
    const id = await createProject(ctx, 'old')
    const res = await ctx.app.inject({
      method: 'PATCH',
      url: `/api/v1/projects/${id}`,
      headers: ctx.authed,
      payload: { name: 'new' },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().name).toBe('new')
  })

  it('deletes for good: the row goes, a tombstone stays, and the project stops being listed', async () => {
    const ctx = await setup()
    const id = await createProject(ctx, 'gone')
    expect(
      (
        await ctx.app.inject({
          method: 'DELETE',
          url: `/api/v1/projects/${id}`,
          headers: ctx.authed,
        })
      ).statusCode,
    ).toBe(204)

    const list = await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/projects',
      headers: ctx.authed,
    })
    expect(ordinary(list.json())).toEqual([])
    const rows = await ctx.db.execute(sql`select 1 from projects where id = ${id}`)
    expect(rows.rows).toHaveLength(0)
    const stone = await ctx.app.inject({
      method: 'GET',
      url: `/api/v1/tombstones/project/${id}`,
      headers: ctx.authed,
    })
    expect(stone.statusCode).toBe(200)
    expect(stone.json()).toMatchObject({ title: 'gone' })
  })

  it('refuses an empty patch, as every update does', async () => {
    const ctx = await setup()
    const id = await createProject(ctx, 'P')
    const res = await ctx.app.inject({
      method: 'PATCH',
      url: `/api/v1/projects/${id}`,
      headers: ctx.authed,
      payload: {},
    })
    expect(res.statusCode).toBe(400)
  })

  it('a deleted project is gone even with archived=true, and cannot be patched', async () => {
    const ctx = await setup()
    const id = await createProject(ctx, 'gone')
    await ctx.app.inject({ method: 'DELETE', url: `/api/v1/projects/${id}`, headers: ctx.authed })
    const list = await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/projects?archived=true',
      headers: ctx.authed,
    })
    expect(list.json().projects).toEqual([])
    const patch = await ctx.app.inject({
      method: 'PATCH',
      url: `/api/v1/projects/${id}`,
      headers: ctx.authed,
      payload: { name: 'zombie' },
    })
    expect(patch.statusCode).toBe(404)
    // RFC 9457, like every other refusal: a 404 answering in HTML or in a bare string reaches the
    // client as an unparseable error rather than one it can say something about.
    expect(patch.headers['content-type']).toContain('application/problem+json')
    expect(patch.json()).toMatchObject({ status: 404, title: expect.any(String) })
  })

  it('archived projects are excluded unless asked for', async () => {
    const ctx = await setup()
    const id = await createProject(ctx, 'done')
    await ctx.app.inject({
      method: 'PATCH',
      url: `/api/v1/projects/${id}`,
      headers: ctx.authed,
      payload: { archived: true },
    })
    const plain = await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/projects',
      headers: ctx.authed,
    })
    expect(ordinary(plain.json())).toEqual([])
    const withArchived = await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/projects?archived=true',
      headers: ctx.authed,
    })
    expect(withArchived.json().projects).toHaveLength(1)
  })

  // Workspace scoping lives in the service layer. Another user's project must be
  // invisible and unmodifiable, and must read as 404 rather than 403 so its existence is not
  // disclosed.
  it('cannot see or touch another workspace projects', async () => {
    const a = await setup()
    const aId = await createProject(a, 'mine')

    const bAuthed = (await secondUser(a)).authed

    // The full list, not `ordinary()`: that filter would hide an inbox leaked from workspace A.
    // B sees exactly its own inbox and nothing of A's.
    const bWorkspaceId = (
      await a.app.inject({ method: 'GET', url: '/api/v1/auth/me', headers: bAuthed })
    ).json().workspaceId as string
    const bList = (
      await a.app.inject({ method: 'GET', url: '/api/v1/projects', headers: bAuthed })
    ).json().projects as (Listed & { workspaceId: string })[]
    expect(bList).toHaveLength(1)
    expect(bList[0]!.isInbox).toBe(true)
    expect(bList[0]!.workspaceId).toBe(bWorkspaceId)

    // A's inbox too: archiving an inbox is refused with 409, so if the pre-read were not scoped to
    // the caller's workspace, B would learn that this id is an inbox instead of getting a 404.
    const aInboxId = (
      await a.app.inject({ method: 'GET', url: '/api/v1/projects', headers: a.authed })
    )
      .json()
      .projects.find((p: Listed) => p.isInbox).id as string

    for (const [method, payload, id] of [
      ['PATCH', { name: 'stolen' }, aId],
      // The one project path with a pre-read before its scoped update, so the one place a scoping
      // slip could behave differently from its siblings.
      ['PATCH', { archived: true }, aId],
      ['PATCH', { archived: true }, aInboxId],
      ['DELETE', undefined, aId],
    ] as const) {
      const res = await a.app.inject({
        method,
        url: `/api/v1/projects/${id}`,
        headers: bAuthed,
        ...(payload ? { payload } : {}),
      })
      expect(res.statusCode, method).toBe(404)
    }
  })
})

// `visibleProjects` does two jobs, scoping to the workspace and hiding soft-deleted rows, and every
// project read and write goes through it. Each condition is crossed with every route that uses it,
// so removing either half of the predicate fails something on its own.
describe('project visibility', () => {
  type Scenario = {
    name: string
    // The caller whose view is under test, given the owner's context and the other workspace's headers.
    caller: (owner: Harness, other: Record<string, string>) => Record<string, string>
    prepare: (owner: Harness, id: string) => Promise<void>
  }

  const scenarios: Scenario[] = [
    {
      name: 'a project of another workspace',
      caller: (_o, other) => other,
      prepare: async () => {},
    },
    {
      name: 'a soft-deleted project',
      caller: (owner) => owner.authed,
      prepare: async (owner, id) => {
        const res = await owner.app.inject({
          method: 'DELETE',
          url: `/api/v1/projects/${id}`,
          headers: owner.authed,
        })
        expect(res.statusCode).toBe(204)
      },
    },
  ]

  /** Another workspace's session on the same app. */
  const otherWorkspace = async (ctx: Harness) => (await secondUser(ctx)).authed

  const ids = async (ctx: Harness, authed: Record<string, string>, archived: boolean) => {
    const res = await ctx.app.inject({
      method: 'GET',
      url: `/api/v1/projects${archived ? '?archived=true' : ''}`,
      headers: authed,
    })
    expect(res.statusCode).toBe(200)
    return (res.json() as { projects: Listed[] }).projects.map((p) => p.id)
  }

  describe.each(scenarios)('$name', (scenario) => {
    // listProjects, for both of the views it has: archived projects are listed apart from the rest.
    it.each([false, true])('is absent from the list (archived=%s)', async (archived) => {
      const ctx = await setup()
      const id = await createProject(ctx, 'target')
      if (archived) {
        const res = await ctx.app.inject({
          method: 'PATCH',
          url: `/api/v1/projects/${id}`,
          headers: ctx.authed,
          payload: { archived: true },
        })
        expect(res.statusCode).toBe(200)
      }
      const other = await otherWorkspace(ctx)

      // Control: the owner does see it, so the absence below is not just an empty or broken list.
      expect(await ids(ctx, ctx.authed, archived)).toContain(id)

      await scenario.prepare(ctx, id)
      expect(await ids(ctx, scenario.caller(ctx, other), archived)).not.toContain(id)
    })

    // updateProject: a rename and both archive directions.
    it.each([
      ['rename', { name: 'stolen' }],
      ['archive', { archived: true }],
      ['unarchive', { archived: false }],
    ] as const)('answers 404 to updateProject: %s', async (_label, payload) => {
      const ctx = await setup()
      const id = await createProject(ctx, 'target')
      const other = await otherWorkspace(ctx)
      await scenario.prepare(ctx, id)

      const res = await ctx.app.inject({
        method: 'PATCH',
        url: `/api/v1/projects/${id}`,
        headers: scenario.caller(ctx, other),
        payload,
      })
      expect(res.statusCode).toBe(404)
      expect(res.headers['content-type']).toContain('application/problem+json')
    })

    // softDeleteProject
    it('answers 404 to softDeleteProject', async () => {
      const ctx = await setup()
      const id = await createProject(ctx, 'target')
      const other = await otherWorkspace(ctx)
      await scenario.prepare(ctx, id)

      const res = await ctx.app.inject({
        method: 'DELETE',
        url: `/api/v1/projects/${id}`,
        headers: scenario.caller(ctx, other),
      })
      expect(res.statusCode).toBe(404)
      expect(res.headers['content-type']).toContain('application/problem+json')
    })
  })
})

// The project list returns more than nothing but names, so the left rail had nothing to show
// beside a destination. The tasks module's `openTasks` column is counted by the server in the
// same query that lists the projects -- never in the client, which would have to fetch every task
// of every project.
describe('project open-task counts', () => {
  const listed = async (ctx: Harness, archived = false) => {
    const res = await ctx.app.inject({
      method: 'GET',
      url: `/api/v1/projects${archived ? '?archived=true' : ''}`,
      headers: ctx.authed,
    })
    expect(res.statusCode).toBe(200)
    const body = res.json() as { projects: { name: string; columns: { openTasks: number } }[] }
    return Object.fromEntries(body.projects.map((p) => [p.name, p.columns.openTasks]))
  }

  const patch = async (ctx: Harness, id: string, payload: Record<string, unknown>) => {
    const res = await ctx.app.inject({
      method: 'PATCH',
      url: `/api/v1/tasks/${id}`,
      headers: ctx.authed,
      payload,
    })
    expect(res.statusCode).toBe(200)
  }

  it('counts every task that is not done, cancelled or deleted, at any depth', async () => {
    const ctx = await setup()
    const a = await createProject(ctx, 'A')
    const b = await createProject(ctx, 'B')

    // Two roots, one child of the first: depth must not change the count.
    const open1 = await createTask(ctx, a, 'open 1')
    await createTask(ctx, a, 'open child', open1)
    await createTask(ctx, a, 'open 2')
    // One of each kind that must NOT count.
    await patch(ctx, await createTask(ctx, a, 'finished'), { status: 'done' })
    await patch(ctx, await createTask(ctx, a, 'abandoned'), { status: 'cancelled' })
    const gone = await createTask(ctx, a, 'deleted')
    expect(
      (
        await ctx.app.inject({
          method: 'DELETE',
          url: `/api/v1/tasks/${gone}`,
          headers: ctx.authed,
        })
      ).statusCode,
    ).toBe(204)
    // A task in the OTHER project, so the subquery cannot be counting the whole workspace.
    await createTask(ctx, b, 'elsewhere')

    expect(await listed(ctx)).toEqual({ Inbox: 0, A: 3, B: 1 })
  })

  it('follows a status change back and forth', async () => {
    const ctx = await setup()
    const a = await createProject(ctx, 'A')
    const t = await createTask(ctx, a, 'one')
    expect((await listed(ctx)).A).toBe(1)
    await patch(ctx, t, { status: 'done' })
    expect((await listed(ctx)).A).toBe(0)
    // Back out of done: the count is derived, never stored, so it comes back on its own.
    await patch(ctx, t, { status: 'todo' })
    expect((await listed(ctx)).A).toBe(1)
  })

  it('counts another workspace nothing of ours', async () => {
    const ctx = await setup()
    const mine = await createProject(ctx, 'mine')
    await createTask(ctx, mine, 'mine 1')
    await createTask(ctx, mine, 'mine 2')

    const theirs = (await secondUser(ctx, 'counts@example.com')).authed
    const other = await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/projects',
      headers: theirs,
    })
    const body = other.json() as { projects: { name: string; columns: { openTasks: number } }[] }
    // They see only their own inbox, and it is empty -- our two tasks are not in anyone else's count.
    expect(body.projects.map((p) => [p.name, p.columns.openTasks])).toEqual([['Inbox', 0]])
  })

  it('carries the count on the archived list too', async () => {
    const ctx = await setup()
    const a = await createProject(ctx, 'A')
    await createTask(ctx, a, 'still open')
    expect(
      (
        await ctx.app.inject({
          method: 'PATCH',
          url: `/api/v1/projects/${a}`,
          headers: ctx.authed,
          payload: { archived: true },
        })
      ).statusCode,
    ).toBe(200)
    expect(await listed(ctx, true)).toEqual({ A: 1 })
  })
})
