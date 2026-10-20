import type { OrganisationResponse, PersonResponse } from '@ctws/contracts'
import { sql } from 'drizzle-orm'
import { afterEach, describe, expect, it } from 'vitest'
import { createOrganisation, createPerson } from '../../helpers/builders'
import { appWithUser, type Harness, secondUser } from '../../helpers/harness'

/**
 * ORGANISATIONS AND ROLES (FR-047, FR-064, FR-065, FR-099): a company, a law firm, a school; the
 * roles people hold or held there, known to the month; types as a free list; folding two
 * organisations into one.
 */
const cleanups: (() => Promise<void>)[] = []
afterEach(async () => {
  for (const stop of cleanups.splice(0)) await stop()
})

async function setup() {
  const ctx = await appWithUser()
  cleanups.push(ctx.stop)
  return ctx
}

async function org(ctx: Harness, id: string): Promise<OrganisationResponse> {
  const res = await ctx.app.inject({
    method: 'GET',
    url: `/api/v1/organisations/${id}`,
    headers: ctx.authed,
  })
  expect(res.statusCode, res.body).toBe(200)
  return res.json() as OrganisationResponse
}

async function putRoles(ctx: Harness, personId: string, roles: object[]) {
  return ctx.app.inject({
    method: 'PUT',
    url: `/api/v1/people/${personId}/roles`,
    headers: ctx.authed,
    payload: { roles },
  })
}

describe('organisations', () => {
  it('are created with a free-text type, listed by type, and the types offered as a list', async () => {
    const ctx = await setup()
    await createOrganisation(ctx, { name: 'Stripe', type: 'Company' })
    await createOrganisation(ctx, { name: 'Harbour & Lane LLP', type: 'Law firm' })
    await createOrganisation(ctx, { name: 'Morrow Legal', type: 'Law firm' })
    await createOrganisation(ctx, { name: 'Somewhere' })

    const types = await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/organisations?view=types',
      headers: ctx.authed,
    })
    expect(types.json()).toEqual({
      types: [
        { type: 'Law firm', count: 2 },
        { type: 'Company', count: 1 },
      ],
    })

    const firms = await ctx.app.inject({
      method: 'GET',
      url: `/api/v1/organisations?type=${encodeURIComponent('Law firm')}`,
      headers: ctx.authed,
    })
    expect(
      (firms.json() as { organisations: OrganisationResponse[] }).organisations.map((o) => o.name),
    ).toEqual(['Harbour & Lane LLP', 'Morrow Legal'])
  })

  it('logs its changes field by field', async () => {
    const ctx = await setup()
    const { id } = await createOrganisation(ctx, { name: 'Stripe' })
    const res = await ctx.app.inject({
      method: 'PATCH',
      url: `/api/v1/organisations/${id}`,
      headers: ctx.authed,
      payload: { website: 'https://stripe.com', type: 'Company' },
    })
    expect(res.statusCode, res.body).toBe(200)
    const timeline = await ctx.app.inject({
      method: 'GET',
      url: `/api/v1/timeline?type=organisation&id=${id}`,
      headers: ctx.authed,
    })
    const types = (
      timeline.json() as { entries: { event: { type: string; payload: { field?: string } } }[] }
    ).entries.map((e) => [e.event.type, e.event.payload.field])
    expect(types).toEqual([
      ['field_changed', 'website'],
      ['field_changed', 'type'],
      ['created', undefined],
    ])
  })

  it('is not seen from another workspace', async () => {
    const ctx = await setup()
    const { id } = await createOrganisation(ctx, { name: 'Stripe' })
    const other = await secondUser(ctx)
    const res = await other.app.inject({
      method: 'GET',
      url: `/api/v1/organisations/${id}`,
      headers: other.authed,
    })
    expect(res.statusCode).toBe(404)
  })
})

describe('roles', () => {
  it('are a set on the person, known to the month, current ones first on the organisation', async () => {
    const ctx = await setup()
    const tencent = await createOrganisation(ctx, { name: 'Tencent' })
    const bytedance = await createOrganisation(ctx, { name: 'ByteDance' })
    const wendy = await createPerson(ctx, { name: '李雯' })

    const res = await putRoles(ctx, wendy.id, [
      { organisationId: tencent.id, title: 'Product manager', from: '2024-03' },
      { organisationId: tencent.id, title: 'Graduate mentor', from: '2025-09' },
      { organisationId: bytedance.id, title: 'Analyst', from: '2021-07', to: '2024-02' },
    ])
    expect(res.statusCode, res.body).toBe(200)
    const person = res.json() as PersonResponse
    expect(person.roles.map((r) => [r.organisationName, r.title, r.from, r.to])).toEqual([
      ['Tencent', 'Product manager', '2024-03', null],
      ['Tencent', 'Graduate mentor', '2025-09', null],
      ['ByteDance', 'Analyst', '2021-07', '2024-02'],
    ])

    const at = await org(ctx, tencent.id)
    expect(at.people.now.map((h) => [h.name, h.title])).toEqual([
      ['李雯', 'Product manager'],
      ['李雯', 'Graduate mentor'],
    ])
    expect(at.people.before).toEqual([])
    expect(at.roleCount).toBe(1)
    expect((await org(ctx, bytedance.id)).people.before.map((h) => h.title)).toEqual(['Analyst'])
  })

  it('refuses an end before the start, and an organisation from elsewhere', async () => {
    const ctx = await setup()
    const stripe = await createOrganisation(ctx, { name: 'Stripe' })
    const p = await createPerson(ctx, { name: 'Mira Chen' })
    const backwards = await putRoles(ctx, p.id, [
      { organisationId: stripe.id, from: '2026-03', to: '2025-01' },
    ])
    expect(backwards.statusCode).toBe(400)
    expect(backwards.body).toContain('The end is before the start.')

    const other = await secondUser(ctx)
    const theirs = await createOrganisation(other, { name: 'Theirs' })
    expect((await putRoles(ctx, p.id, [{ organisationId: theirs.id }])).statusCode).toBe(404)
  })

  it('go when the organisation is deleted, and move when it is merged', async () => {
    const ctx = await setup()
    const a = await createOrganisation(ctx, { name: 'Stripe' })
    const b = await createOrganisation(ctx, { name: 'Stripe Inc.' })
    const p = await createPerson(ctx, { name: 'Mira Chen' })
    const q = await createPerson(ctx, { name: 'Tom Okafor' })
    await putRoles(ctx, p.id, [{ organisationId: a.id, title: 'Staff engineer' }])
    await putRoles(ctx, q.id, [{ organisationId: b.id, title: 'Recruiter' }])

    const merged = await ctx.app.inject({
      method: 'POST',
      url: `/api/v1/organisations/${b.id}/merge`,
      headers: ctx.authed,
      payload: { into: a.id },
    })
    expect(merged.statusCode, merged.body).toBe(200)
    expect((merged.json() as OrganisationResponse).people.now.map((h) => h.name).sort()).toEqual([
      'Mira Chen',
      'Tom Okafor',
    ])
    expect(
      (
        await ctx.app.inject({
          method: 'GET',
          url: `/api/v1/organisations/${b.id}`,
          headers: ctx.authed,
        })
      ).statusCode,
    ).toBe(404)

    const gone = await ctx.app.inject({
      method: 'DELETE',
      url: `/api/v1/organisations/${a.id}`,
      headers: ctx.authed,
    })
    expect(gone.statusCode).toBe(204)
    const person = await ctx.app.inject({
      method: 'GET',
      url: `/api/v1/people/${p.id}`,
      headers: ctx.authed,
    })
    expect((person.json() as PersonResponse).roles).toEqual([])
  })
})

describe('merging keeps what was said with the merged organisation (BUG-005)', () => {
  it('moves the exchanges across, once each, and the overview still lists them', async () => {
    const ctx = await setup()
    const inc = await createOrganisation(ctx, { name: 'Dbg Inc.' })
    const dbg = await createOrganisation(ctx, { name: 'Dbg' })
    const say = (parties: { type: string; id: string }[]) =>
      ctx.app.inject({
        method: 'POST',
        url: '/api/v1/communication',
        headers: ctx.authed,
        payload: { direction: 'sent', channel: 'email', parties, subject: 'Hi' },
      })
    const one = (await say([{ type: 'organisation', id: inc.id }])).json() as { id: string }
    const both = (
      await say([
        { type: 'organisation', id: inc.id },
        { type: 'organisation', id: dbg.id },
      ])
    ).json() as { id: string }

    const merged = await ctx.app.inject({
      method: 'POST',
      url: `/api/v1/organisations/${inc.id}/merge`,
      headers: ctx.authed,
      payload: { into: dbg.id },
    })
    expect(merged.statusCode, merged.body).toBe(200)
    for (const id of [one.id, both.id]) {
      const read = await ctx.app.inject({
        method: 'GET',
        url: `/api/v1/communication/${id}`,
        headers: ctx.authed,
      })
      expect(read.json().parties).toEqual([{ type: 'organisation', id: dbg.id, name: 'Dbg' }])
    }
    const overview = await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/communication?view=overview',
      headers: ctx.authed,
    })
    expect(
      overview.json().inTouch.map((r: { organisationName: string }) => r.organisationName),
    ).toEqual(['Dbg'])
    expect(overview.json().inTouchTotal).toBe(1)
  })
})

describe('roles are logged (BUG-007)', () => {
  it('records a role added, changed and removed on the person', async () => {
    const ctx = await setup()
    const org = await createOrganisation(ctx, { name: 'Acme' })
    const person = await createPerson(ctx, { name: 'Ying' })
    const put = (roles: object[]) =>
      ctx.app.inject({
        method: 'PUT',
        url: `/api/v1/people/${person.id}/roles`,
        headers: ctx.authed,
        payload: { roles },
      })
    expect((await put([{ organisationId: org.id, title: 'Intern' }])).statusCode).toBe(200)
    expect((await put([{ organisationId: org.id, title: 'Engineer' }])).statusCode).toBe(200)
    expect((await put([])).statusCode).toBe(200)
    const events = await ctx.db.execute(sql`
      select type, payload from events where object_type = 'person' and object_id = ${person.id}
      order by occurred_at, id`)
    expect(events.rows.map((e) => (e as { type: string }).type)).toEqual([
      'created',
      'role_added',
      'role_changed',
      'role_removed',
    ])
    expect(
      (events.rows[2] as { payload: { from: { title: string }; to: { title: string } } }).payload,
    ).toMatchObject({
      from: { title: 'Intern' },
      to: { title: 'Engineer' },
    })
  })
})

describe('the overview (BUG-010)', () => {
  it('counts each type, and everything', async () => {
    const ctx = await setup()
    await createOrganisation(ctx, { name: 'Stripe', type: 'Company' })
    await createOrganisation(ctx, { name: 'Harbour & Lane LLP', type: 'Law firm' })
    await createOrganisation(ctx, { name: 'Somewhere' })
    const res = await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/organisations?view=overview',
      headers: ctx.authed,
    })
    expect(res.statusCode, res.body).toBe(200)
    expect(res.json()).toEqual({
      types: [
        { type: 'Company', count: 1 },
        { type: 'Law firm', count: 1 },
      ],
      untyped: 1,
      total: 3,
    })
  })
})
